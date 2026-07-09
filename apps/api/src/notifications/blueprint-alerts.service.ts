import type {
  Blueprint,
  NotificationType,
  SiriusPlanet,
  SiriusPlanetAppearance,
  SiriusPlanetBlueprintSlot,
} from "../generated/prisma/client.js";
import { env } from "../utils/env.js";
import { prisma } from "../utils/prisma.js";
import { createNotification } from "./notification.service.js";

const wantedNotificationType: NotificationType = "BLUEPRINT_WANTED_ACTIVE";
const visibleAppearanceStatuses = ["ACTIVE", "UPCOMING"] as const;
const defaultScanDelayMs = 2_000;

type ScanMode = "notify" | "prime";

type ScanOptions = {
  mode?: ScanMode;
  userIds?: string[];
  blueprintIds?: string[];
  appearanceIds?: string[];
};

type WantedAppearance = SiriusPlanetAppearance & {
  planet: SiriusPlanet;
  slots: Array<SiriusPlanetBlueprintSlot & { blueprint: Blueprint | null }>;
};

type WantedAlertCandidate = {
  clanId: string;
  userId: string;
  blueprintId: string;
  appearanceId: string;
  blueprintName: string;
  planetName: string;
  ring: number;
  expiresAt: Date;
  slotGroup: string;
  enemyType: string | null;
};

export type WantedBlueprintAlertScanResult = {
  mode: ScanMode;
  evaluated: number;
  primed: number;
  sent: number;
  duplicate: number;
  failed: number;
};

const unique = (items: string[] | undefined) => {
  const values = Array.from(new Set((items ?? []).filter(Boolean)));
  return values.length > 0 ? values : undefined;
};

const isUniqueConstraintError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "P2002";

const formatDateBerlin = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);

const candidateKey = (candidate: WantedAlertCandidate) =>
  [
    candidate.clanId,
    candidate.userId,
    candidate.blueprintId,
    candidate.appearanceId,
  ].join(":");

const buildNotificationBody = (candidate: WantedAlertCandidate) =>
  `${candidate.blueprintName} ist aktuell auf ${candidate.planetName} (${candidate.ring}. Ring) aktiv. Planet platzt am ${formatDateBerlin(
    candidate.expiresAt,
  )}.`;

const buildCandidatePayload = (candidate: WantedAlertCandidate) => ({
  source: "wanted-blueprint-alert-scanner",
  clanId: candidate.clanId,
  blueprintId: candidate.blueprintId,
  appearanceId: candidate.appearanceId,
  planetName: candidate.planetName,
  ring: candidate.ring,
  expiresAt: candidate.expiresAt.toISOString(),
  slotGroup: candidate.slotGroup,
  enemyType: candidate.enemyType,
});

const loadWantedCandidates = async (
  clanId: string,
  options: ScanOptions,
): Promise<WantedAlertCandidate[]> => {
  const userIds = unique(options.userIds);
  const requestedBlueprintIds = unique(options.blueprintIds);
  const appearanceIds = unique(options.appearanceIds);

  if (options.userIds && !userIds) return [];
  if (options.blueprintIds && !requestedBlueprintIds) return [];
  if (options.appearanceIds && !appearanceIds) return [];

  const appearances = (await prisma.siriusPlanetAppearance.findMany({
    where: {
      clanId,
      status: { in: [...visibleAppearanceStatuses] },
      ...(appearanceIds ? { id: { in: appearanceIds } } : {}),
    },
    include: {
      planet: true,
      slots: {
        where: {
          blueprintId: requestedBlueprintIds
            ? { in: requestedBlueprintIds }
            : { not: null },
        },
        include: { blueprint: true },
        orderBy: [
          { slotGroup: "asc" },
          { enemyType: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
    orderBy: [{ expiresAt: "asc" }, { planet: { sortOrder: "asc" } }],
  })) as WantedAppearance[];

  const appearancesWithBlueprintSlots = appearances
    .map((appearance) => ({
      ...appearance,
      slots: appearance.slots.filter((slot) =>
        Boolean(slot.blueprintId && slot.blueprint),
      ),
    }))
    .filter((appearance) => appearance.slots.length > 0);

  const blueprintIds = unique(
    appearancesWithBlueprintSlots.flatMap((appearance) =>
      appearance.slots.map((slot) => slot.blueprintId!),
    ),
  );
  if (!blueprintIds) return [];

  const memberships = await prisma.clanMembership.findMany({
    where: {
      clanId,
      status: "ACTIVE",
      trackingExcluded: false,
      ...(userIds ? { userId: { in: userIds } } : {}),
      user: { isActive: true },
    },
    select: { userId: true },
  });
  const memberUserIds = unique(
    memberships.map((membership) => membership.userId),
  );
  if (!memberUserIds) return [];

  const wantedStatuses = await prisma.userBlueprintStatus.findMany({
    where: {
      userId: { in: memberUserIds },
      blueprintId: { in: blueprintIds },
      status: "WANTED",
    },
    select: { userId: true, blueprintId: true },
  });

  const wantedByBlueprintId = new Map<string, string[]>();
  for (const status of wantedStatuses) {
    const users = wantedByBlueprintId.get(status.blueprintId) ?? [];
    users.push(status.userId);
    wantedByBlueprintId.set(status.blueprintId, users);
  }

  const candidates = new Map<string, WantedAlertCandidate>();
  for (const appearance of appearancesWithBlueprintSlots) {
    for (const slot of appearance.slots) {
      if (!slot.blueprintId || !slot.blueprint) continue;
      const users = wantedByBlueprintId.get(slot.blueprintId) ?? [];
      for (const userId of users) {
        const candidate: WantedAlertCandidate = {
          clanId,
          userId,
          blueprintId: slot.blueprintId,
          appearanceId: appearance.id,
          blueprintName: slot.blueprint.nameDe,
          planetName: appearance.planet.name,
          ring: appearance.ring,
          expiresAt: appearance.expiresAt,
          slotGroup: slot.slotGroup,
          enemyType: slot.enemyType,
        };
        candidates.set(candidateKey(candidate), candidate);
      }
    }
  }

  return Array.from(candidates.values());
};

const createHit = async (candidate: WantedAlertCandidate) =>
  prisma.blueprintNotificationHit.create({
    data: {
      type: wantedNotificationType,
      clanId: candidate.clanId,
      userId: candidate.userId,
      blueprintId: candidate.blueprintId,
      appearanceId: candidate.appearanceId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

const notifyCandidate = async (
  candidate: WantedAlertCandidate,
  hitId: string,
) => {
  const notification = await createNotification({
    userId: candidate.userId,
    clanId: candidate.clanId,
    type: wantedNotificationType,
    title: "Wunsch-BP aktiv",
    body: buildNotificationBody(candidate),
    payloadJson: buildCandidatePayload(candidate),
  });

  if (!notification) {
    await prisma.blueprintNotificationHit
      .delete({ where: { id: hitId } })
      .catch(() => undefined);
    return false;
  }

  await prisma.blueprintNotificationHit.update({
    where: { id: hitId },
    data: {
      notificationId: notification.id,
      lastSeenAt: new Date(),
    },
  });
  return true;
};

export const scanWantedBlueprintAlertsForClan = async (
  clanId: string,
  options: ScanOptions = {},
): Promise<WantedBlueprintAlertScanResult> => {
  const mode = options.mode ?? "notify";
  const candidates = await loadWantedCandidates(clanId, options);
  const result: WantedBlueprintAlertScanResult = {
    mode,
    evaluated: candidates.length,
    primed: 0,
    sent: 0,
    duplicate: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    const hit = await createHit(candidate).catch((error) => {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    });

    if (!hit) {
      result.duplicate += 1;
      continue;
    }

    if (mode === "prime") {
      result.primed += 1;
      continue;
    }

    try {
      if (await notifyCandidate(candidate, hit.id)) {
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      await prisma.blueprintNotificationHit
        .delete({ where: { id: hit.id } })
        .catch(() => undefined);
      result.failed += 1;
      console.error("Wanted blueprint alert notification failed.", error);
    }
  }

  return result;
};

export const scanWantedBlueprintAlertsForUserClans = async (
  userId: string,
  options: Omit<ScanOptions, "userIds"> = {},
) => {
  const memberships = await prisma.clanMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      trackingExcluded: false,
      user: { isActive: true },
    },
    select: { clanId: true },
  });

  const results: WantedBlueprintAlertScanResult[] = [];
  for (const membership of memberships) {
    results.push(
      await scanWantedBlueprintAlertsForClan(membership.clanId, {
        ...options,
        userIds: [userId],
      }),
    );
  }
  return results;
};

const scheduledScans = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleScan = (
  key: string,
  run: () => Promise<unknown>,
  delayMs = defaultScanDelayMs,
) => {
  if (scheduledScans.has(key)) return;
  const timeout = setTimeout(() => {
    scheduledScans.delete(key);
    run().catch((error) => {
      console.error("Wanted blueprint alert scan failed.", error);
    });
  }, delayMs);
  timeout.unref?.();
  scheduledScans.set(key, timeout);
};

export const scheduleWantedBlueprintAlertsForClan = (
  clanId: string,
  options: Omit<ScanOptions, "mode"> = {},
  delayMs?: number,
) => {
  const key = `clan:${clanId}:appearances:${unique(options.appearanceIds)?.sort().join(",") ?? "*"}:blueprints:${
    unique(options.blueprintIds)?.sort().join(",") ?? "*"
  }`;
  scheduleScan(
    key,
    () =>
      scanWantedBlueprintAlertsForClan(clanId, { ...options, mode: "notify" }),
    delayMs,
  );
};

export const scheduleWantedBlueprintAlertsForUserClans = (
  userId: string,
  options: Omit<ScanOptions, "mode" | "userIds"> = {},
  delayMs?: number,
) => {
  const key = `user:${userId}:blueprints:${unique(options.blueprintIds)?.sort().join(",") ?? "*"}`;
  scheduleScan(
    key,
    () =>
      scanWantedBlueprintAlertsForUserClans(userId, {
        ...options,
        mode: "notify",
      }),
    delayMs,
  );
};

export const scanWantedBlueprintAlertsForAllClans = async (
  mode: ScanMode = "notify",
) => {
  const settings = await prisma.clanDiscordSettings.findMany({
    where: {
      enabled: true,
      notificationChannelId: { not: null },
    },
    select: { clanId: true },
  });

  const results: WantedBlueprintAlertScanResult[] = [];
  for (const setting of settings) {
    results.push(
      await scanWantedBlueprintAlertsForClan(setting.clanId, { mode }),
    );
  }
  return results;
};

export const startWantedBlueprintAlertScanner = () => {
  if (!env.wantedBlueprintAlertScannerEnabled) return null;

  let stopped = false;
  const run = async () => {
    if (stopped) return;
    if (env.wantedBlueprintAlertScannerPrimeOnStart) {
      const existingHits = await prisma.blueprintNotificationHit.count();
      if (existingHits === 0) {
        await scanWantedBlueprintAlertsForAllClans("prime");
      }
    }
    await scanWantedBlueprintAlertsForAllClans("notify");
  };

  void run().catch((error) => {
    console.error("Wanted blueprint alert scanner startup failed.", error);
  });

  const timer = setInterval(() => {
    void scanWantedBlueprintAlertsForAllClans("notify").catch((error) => {
      console.error("Wanted blueprint alert scanner failed.", error);
    });
  }, env.wantedBlueprintAlertScannerIntervalMs);
  timer.unref?.();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      for (const timeout of scheduledScans.values()) {
        clearTimeout(timeout);
      }
      scheduledScans.clear();
    },
  };
};
