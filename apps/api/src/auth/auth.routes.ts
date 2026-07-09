import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  setPasswordSchema,
  setupAdminSchema,
  type AuthUserDto,
} from "@bp-tracker/contracts";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, HttpError } from "../utils/http.js";
import {
  clearSessionCookie,
  createSession,
  hashSessionToken,
  setSessionCookie,
} from "./session.js";
import { env } from "../utils/env.js";
import { requireUser } from "./auth.middleware.js";
import {
  buildDiscordAuthorizeUrl,
  createDiscordOAuthState,
  exchangeDiscordCode,
  fetchDiscordUserProfile,
  normalizeRelativeRedirect,
  toClientRedirect,
  verifyDiscordOAuthState,
  type DiscordAuthMode,
  type DiscordUserProfile,
} from "./discord.js";

export const authRouter = Router();

const normalizeUsername = (username: string) => username.trim().toLowerCase();

const queryString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const isUniqueConstraintError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002",
  );

const assertRegistrationIsUnique = async (
  username: string,
  email: string | null,
) => {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { username: true, email: true },
  });

  if (!existingUser) return;

  if (existingUser.username === username) {
    throw new HttpError(409, "Username already exists.");
  }

  throw new HttpError(409, "Email already exists.");
};

const discordLinkSchema = z.object({
  redirect: z.string().optional(),
});

const discordUnlinkSchema = z.object({
  currentPassword: z.string().min(8).max(200),
});

const discordProfileData = (profile: DiscordUserProfile) => ({
  discordUserId: profile.id,
  discordUsername: profile.username,
  discordGlobalName: profile.global_name ?? null,
  discordAvatarHash: profile.avatar ?? null,
  discordLinkedAt: new Date(),
});

const verifiedDiscordEmail = (profile: DiscordUserProfile) =>
  profile.verified && profile.email ? profile.email.trim().toLowerCase() : null;

const serializeAuthUser = async (userId: string): Promise<AuthUserDto> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { clan: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    throw new HttpError(404, "User not found.");
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    globalRole: user.globalRole,
    hasPassword: Boolean(user.passwordHash),
    discord: {
      linked: Boolean(user.discordUserId),
      username: user.discordUsername,
      globalName: user.discordGlobalName,
      avatarHash: user.discordAvatarHash,
    },
    memberships: user.memberships.map((membership) => ({
      clanId: membership.clanId,
      clanName: membership.clan.name,
      clanSlug: membership.clan.slug,
      role: membership.role,
      status: membership.status,
      trackingExcluded: membership.trackingExcluded,
    })),
  };
};

const createUniqueDiscordUsername = async (profile: DiscordUserProfile) => {
  const base = `discord-${profile.id}`.slice(0, 80);
  let candidate = base;
  let suffix = 1;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 80 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  return candidate;
};

const createDiscordAuthorizeUrlForRequest = async (
  mode: DiscordAuthMode,
  redirect: string,
  clanId?: string,
) => {
  let validatedClanId: string | undefined;

  if (clanId) {
    const parsedClanId = z.string().uuid().safeParse(clanId);
    if (!parsedClanId.success) {
      throw new HttpError(400, "Invalid clan id.");
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId.data },
    });
    if (!clan || !clan.isPublic) {
      throw new HttpError(404, "Clan not found.");
    }
    validatedClanId = clan.id;
  }

  const state = createDiscordOAuthState(mode, redirect, validatedClanId);
  return buildDiscordAuthorizeUrl(state);
};

const ensurePendingClanMembership = async (
  userId: string,
  clanId: string | undefined,
) => {
  if (!clanId) return;

  const existing = await prisma.clanMembership.findUnique({
    where: { clanId_userId: { clanId, userId } },
  });
  if (!existing) {
    await prisma.clanMembership.create({
      data: {
        clanId,
        userId,
        role: "MEMBER",
        status: "PENDING",
      },
    });
    return;
  }

  if (existing.status === "REJECTED" || existing.status === "LEFT") {
    await prisma.clanMembership.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        role: "MEMBER",
        approvedAt: null,
        approvedById: null,
      },
    });
  }
};

const applyDiscordProfile = async (
  userId: string,
  profile: DiscordUserProfile,
) => {
  const email = verifiedDiscordEmail(profile);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const canSetEmail =
    email &&
    !user?.email &&
    !(await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    }));

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...discordProfileData(profile),
      ...(canSetEmail ? { email } : {}),
      notificationPrefs: {
        upsert: {
          create: {},
          update: {},
        },
      },
    },
  });
};

const createUserFromDiscord = async (
  profile: DiscordUserProfile,
  clanId?: string,
) => {
  const username = await createUniqueDiscordUsername(profile);
  const email = verifiedDiscordEmail(profile);
  const user = await prisma.user.create({
    data: {
      username,
      displayName: (profile.global_name || profile.username).trim(),
      email,
      passwordHash: null,
      ...discordProfileData(profile),
      memberships: clanId
        ? {
            create: {
              clanId,
              role: "MEMBER",
              status: "PENDING",
            },
          }
        : undefined,
      notificationPrefs: { create: {} },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: clanId
        ? "auth.discord_register_pending"
        : "auth.discord_register",
      entityType: "User",
      entityId: user.id,
      afterJson: { discordUserId: profile.id, clanId },
    },
  });

  return user;
};

authRouter.get(
  "/setup-state",
  asyncHandler(async (_req, res) => {
    const adminCount = await prisma.user.count({
      where: { globalRole: "ADMIN" },
    });
    res.json({
      setupRequired: adminCount === 0,
      setupTokenRequired: Boolean(env.firstAdminSetupToken),
    });
  }),
);

authRouter.post(
  "/setup",
  asyncHandler(async (req, res) => {
    const adminCount = await prisma.user.count({
      where: { globalRole: "ADMIN" },
    });
    if (adminCount > 0) {
      throw new HttpError(409, "Initial admin already exists.");
    }

    const input = setupAdminSchema.parse(req.body);
    if (
      env.firstAdminSetupToken &&
      input.setupToken !== env.firstAdminSetupToken
    ) {
      throw new HttpError(403, "Invalid setup token.");
    }

    const username = normalizeUsername(input.username);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const existingUser = await prisma.user.findUnique({ where: { username } });
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            displayName: input.displayName.trim(),
            passwordHash,
            globalRole: "ADMIN",
            isActive: true,
            notificationPrefs: {
              upsert: {
                create: {},
                update: {},
              },
            },
          },
        })
      : await prisma.user.create({
          data: {
            username,
            displayName: input.displayName.trim(),
            passwordHash,
            globalRole: "ADMIN",
            notificationPrefs: { create: {} },
          },
        });

    if (existingUser) {
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: existingUser
          ? "auth.setup_admin_promote_existing"
          : "auth.setup_admin",
        entityType: "User",
        entityId: user.id,
      },
    });

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ user: await serializeAuthUser(user.id) });
  }),
);

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const username = normalizeUsername(input.username);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const clan = await prisma.clan.findUnique({ where: { id: input.clanId } });
    if (!clan || !clan.isPublic) {
      throw new HttpError(404, "Clan not found.");
    }

    await assertRegistrationIsUnique(username, email);

    const passwordHash = await bcrypt.hash(input.password, 12);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          username,
          displayName: input.displayName.trim(),
          email,
          passwordHash,
          memberships: {
            create: {
              clanId: clan.id,
              role: "MEMBER",
              status: "PENDING",
            },
          },
          notificationPrefs: { create: {} },
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "Username or email already exists.");
      }
      throw error;
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "auth.register_pending",
        entityType: "ClanMembership",
        entityId: clan.id,
        afterJson: { clanId: clan.id, userId: user.id },
      },
    });

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ user: await serializeAuthUser(user.id) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { username: normalizeUsername(input.username) },
    });
    if (!user || !user.isActive) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const passwordMatches = user.passwordHash
      ? await bcrypt.compare(input.password, user.passwordHash)
      : false;
    if (!passwordMatches) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: await serializeAuthUser(user.id) });
  }),
);

authRouter.get(
  "/discord",
  asyncHandler(async (req, res) => {
    const mode = queryString(req.query.mode) ?? "login";
    if (!["login", "register", "link"].includes(mode)) {
      throw new HttpError(400, "Invalid Discord auth mode.");
    }
    if (mode === "link" && !req.auth?.user) {
      throw new HttpError(401, "Login required.");
    }

    const redirect = normalizeRelativeRedirect(
      queryString(req.query.redirect),
      "/account",
    );
    const authorizeUrl = await createDiscordAuthorizeUrlForRequest(
      mode as DiscordAuthMode,
      redirect,
      queryString(req.query.clanId),
    );
    res.redirect(authorizeUrl);
  }),
);

authRouter.post(
  "/discord/link",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = discordLinkSchema.parse(req.body ?? {});
    const authorizeUrl = await createDiscordAuthorizeUrlForRequest(
      "link",
      normalizeRelativeRedirect(input.redirect, "/account"),
    );
    res.json({ authorizeUrl });
  }),
);

authRouter.post(
  "/discord/unlink",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = discordUnlinkSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.user.id },
    });
    if (!user) {
      throw new HttpError(404, "User not found.");
    }
    if (!user.discordUserId) {
      res.json({ user: await serializeAuthUser(user.id) });
      return;
    }
    if (!user.passwordHash) {
      throw new HttpError(409, "Set a password before unlinking Discord.");
    }

    const passwordMatches = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new HttpError(403, "Current password is incorrect.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        discordUserId: null,
        discordUsername: null,
        discordGlobalName: null,
        discordAvatarHash: null,
        discordLinkedAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "auth.discord_unlink",
        entityType: "User",
        entityId: user.id,
      },
    });

    res.json({ user: await serializeAuthUser(user.id) });
  }),
);

authRouter.get(
  "/discord/callback",
  asyncHandler(async (req, res) => {
    let redirect = "/account";

    try {
      const code = queryString(req.query.code);
      const stateParam = queryString(req.query.state);
      if (!code || !stateParam) {
        throw new HttpError(400, "Missing Discord OAuth callback data.");
      }

      const state = verifyDiscordOAuthState(stateParam);
      redirect = state.redirect;
      const accessToken = await exchangeDiscordCode(code);
      const profile = await fetchDiscordUserProfile(accessToken);
      const email = verifiedDiscordEmail(profile);

      if (state.mode === "link") {
        if (!req.auth?.user) {
          res.redirect(
            toClientRedirect(redirect, { discord: "login_required" }),
          );
          return;
        }

        const existingByDiscord = await prisma.user.findUnique({
          where: { discordUserId: profile.id },
        });
        if (existingByDiscord && existingByDiscord.id !== req.auth.user.id) {
          res.redirect(
            toClientRedirect(redirect, { discord: "already_linked" }),
          );
          return;
        }

        const updated = await applyDiscordProfile(req.auth.user.id, profile);
        await prisma.auditLog.create({
          data: {
            actorUserId: updated.id,
            action: "auth.discord_link",
            entityType: "User",
            entityId: updated.id,
            afterJson: { discordUserId: profile.id },
          },
        });
        res.redirect(toClientRedirect(redirect, { discord: "linked" }));
        return;
      }

      let user = await prisma.user.findUnique({
        where: { discordUserId: profile.id },
      });

      if (!user && email) {
        const existingByEmail = await prisma.user.findUnique({
          where: { email },
        });
        if (
          existingByEmail?.discordUserId &&
          existingByEmail.discordUserId !== profile.id
        ) {
          res.redirect(
            toClientRedirect(redirect, { discord: "email_conflict" }),
          );
          return;
        }
        if (existingByEmail) {
          user = await applyDiscordProfile(existingByEmail.id, profile);
          await prisma.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "auth.discord_link_by_email",
              entityType: "User",
              entityId: user.id,
              afterJson: { discordUserId: profile.id },
            },
          });
        }
      }

      if (!user) {
        user = await createUserFromDiscord(profile, state.clanId);
      } else {
        if (!user.isActive) {
          res.redirect(toClientRedirect(redirect, { discord: "inactive" }));
          return;
        }
        user = await applyDiscordProfile(user.id, profile);
        if (state.mode === "register") {
          await ensurePendingClanMembership(user.id, state.clanId);
        }
      }

      const session = await createSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);
      res.redirect(
        toClientRedirect(redirect, {
          discord: state.mode === "register" ? "registered" : "logged_in",
        }),
      );
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error(error);
      }
      res.redirect(toClientRedirect(redirect, { discord: "failed" }));
    }
  }),
);

authRouter.post(
  "/logout",
  requireUser,
  asyncHandler(async (req, res) => {
    const token = req.auth?.sessionToken;
    if (token) {
      await prisma.session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    clearSessionCookie(res);
    res.status(204).send();
  }),
);

authRouter.post(
  "/change-password",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.user.id },
    });
    if (!user) {
      throw new HttpError(404, "User not found.");
    }
    if (!user.passwordHash) {
      throw new HttpError(409, "Set a password before changing it.");
    }

    const passwordMatches = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new HttpError(403, "Current password is incorrect.");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    const currentToken = req.auth?.sessionToken;
    await prisma.session.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        ...(currentToken
          ? { NOT: { tokenHash: hashSessionToken(currentToken) } }
          : {}),
      },
      data: { revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "auth.change_password",
        entityType: "User",
        entityId: user.id,
      },
    });

    res.status(204).send();
  }),
);

authRouter.post(
  "/set-password",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = setPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.user.id },
    });
    if (!user) {
      throw new HttpError(404, "User not found.");
    }
    if (user.passwordHash) {
      throw new HttpError(409, "Password is already set.");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "auth.set_password",
        entityType: "User",
        entityId: user.id,
      },
    });

    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.auth?.user) {
      res.json({ user: null });
      return;
    }

    res.json({ user: await serializeAuthUser(req.auth.user.id) });
  }),
);
