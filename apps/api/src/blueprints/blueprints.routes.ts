import { Router } from "express";
import { z } from "zod";
import {
  bulkUpdateBlueprintStatusSchema,
  updateBlueprintStatusSchema,
} from "@bp-tracker/contracts";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, HttpError, routeParam } from "../utils/http.js";
import { requireAdmin, requireUser } from "../auth/auth.middleware.js";
import {
  blueprintSummaryInclude,
  serializeBlueprintSummary,
} from "./blueprint.dto.js";
import { scheduleWantedBlueprintAlertsForUserClans } from "../notifications/blueprint-alerts.service.js";
import { scheduleClanDiscordStatusPublish } from "../notifications/discord-status.service.js";

export const blueprintsRouter = Router();

const normalizeBlueprintStatus = (status: string | null | undefined) =>
  status === "OWNED" || status === "WANTED" ? status : "MISSING";

const createBlueprintSchema = z.object({
  canonicalName: z.string().min(2).max(240),
  nameDe: z.string().trim().min(2).max(240).optional(),
  nameEn: z.string().trim().min(2).max(240).nullable().optional(),
  systemId: z.string().uuid().optional(),
  itemTypeId: z.string().uuid().optional(),
  variant: z.string().max(80).optional(),
  slotGroup: z
    .enum([
      "SLOT_18",
      "SLOT_14",
      "SLOT_12",
      "SLOT_5",
      "SLOT_2",
      "RESOURCE",
      "CUSTOM",
    ])
    .optional(),
  siriusRing: z.number().int().min(1).max(5).nullable().optional(),
  siriusTechTier: z
    .enum(["OOLYTE", "DOLOMYTE", "CLAY", "KENYTE", "ANCIENT"])
    .nullable()
    .optional(),
  rarity: z
    .enum([
      "STANDARD",
      "RARE",
      "ANCIENT",
      "EVENT",
      "CONQUEST",
      "SPECIAL",
      "COSMETIC",
    ])
    .default("STANDARD"),
  partsRequired: z.number().int().positive().optional(),
  level: z.number().int().positive().optional(),
  price: z.number().int().nonnegative().optional(),
  sourceNotes: z.string().max(2000).optional(),
});

const stringQuery = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const scheduleDiscordStatusForUserClans = async (userId: string) => {
  const memberships = await prisma.clanMembership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { clanId: true },
  });
  for (const membership of memberships) {
    scheduleClanDiscordStatusPublish(membership.clanId);
  }
};

blueprintsRouter.get(
  "/systems",
  asyncHandler(async (_req, res) => {
    const systems = await prisma.gameSystem.findMany({
      orderBy: { sortOrder: "asc" },
    });
    res.json({ systems });
  }),
);

blueprintsRouter.get(
  "/item-types",
  asyncHandler(async (_req, res) => {
    const itemTypes = await prisma.blueprintItemType.findMany({
      include: { translations: { orderBy: { locale: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { nameDe: "asc" }],
    });
    res.json({ itemTypes });
  }),
);

blueprintsRouter.get(
  "/me/statuses",
  requireUser,
  asyncHandler(async (req, res) => {
    const statuses = await prisma.userBlueprintStatus.findMany({
      where: { userId: req.auth!.user.id },
      include: { blueprint: true },
      orderBy: { updatedAt: "desc" },
    });
    res.json({
      statuses: statuses.map((status) => ({
        ...status,
        status: normalizeBlueprintStatus(status.status),
      })),
    });
  }),
);

blueprintsRouter.put(
  "/me/statuses",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = bulkUpdateBlueprintStatusSchema.parse(req.body);
    const uniqueBlueprintIds = Array.from(new Set(input.blueprintIds));
    const existingBlueprints = await prisma.blueprint.findMany({
      where: { id: { in: uniqueBlueprintIds } },
      select: { id: true },
    });
    const existingBlueprintIds = new Set(
      existingBlueprints.map((blueprint) => blueprint.id),
    );
    const missingBlueprintIds = uniqueBlueprintIds.filter(
      (blueprintId) => !existingBlueprintIds.has(blueprintId),
    );

    if (missingBlueprintIds.length > 0) {
      throw new HttpError(
        404,
        `Blueprints not found: ${missingBlueprintIds.join(", ")}`,
      );
    }

    const operations = uniqueBlueprintIds.map((blueprintId) =>
      prisma.userBlueprintStatus.upsert({
        where: {
          userId_blueprintId: { userId: req.auth!.user.id, blueprintId },
        },
        update: {
          status: input.status,
          source: "MANUAL",
          updatedById: req.auth!.user.id,
        },
        create: {
          userId: req.auth!.user.id,
          blueprintId,
          status: input.status,
          source: "MANUAL",
          updatedById: req.auth!.user.id,
        },
      }),
    );

    const statuses = await prisma.$transaction(operations);
    await scheduleDiscordStatusForUserClans(req.auth!.user.id);
    if (input.status === "WANTED") {
      scheduleWantedBlueprintAlertsForUserClans(req.auth!.user.id, {
        blueprintIds: uniqueBlueprintIds,
      });
    }
    res.json({ statuses });
  }),
);

blueprintsRouter.put(
  "/me/statuses/:blueprintId",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = updateBlueprintStatusSchema.parse(req.body);
    const blueprintId = routeParam(req, "blueprintId");
    const blueprint = await prisma.blueprint.findUnique({
      where: { id: blueprintId },
    });
    if (!blueprint) {
      throw new HttpError(404, "Blueprint not found.");
    }

    const status = await prisma.userBlueprintStatus.upsert({
      where: {
        userId_blueprintId: {
          userId: req.auth!.user.id,
          blueprintId: blueprint.id,
        },
      },
      update: {
        status: input.status,
        source: "MANUAL",
        updatedById: req.auth!.user.id,
      },
      create: {
        userId: req.auth!.user.id,
        blueprintId: blueprint.id,
        status: input.status,
        source: "MANUAL",
        updatedById: req.auth!.user.id,
      },
    });

    await scheduleDiscordStatusForUserClans(req.auth!.user.id);
    if (input.status === "WANTED") {
      scheduleWantedBlueprintAlertsForUserClans(req.auth!.user.id, {
        blueprintIds: [blueprint.id],
      });
    }
    res.json({ status });
  }),
);

blueprintsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = stringQuery(req.query.q);
    const slotGroup = stringQuery(req.query.slotGroup);
    const systemId = stringQuery(req.query.systemId);
    const itemTypeId = stringQuery(req.query.itemTypeId);

    const blueprints = await prisma.blueprint.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { canonicalName: { contains: q, mode: "insensitive" } },
                { nameDe: { contains: q, mode: "insensitive" } },
                { nameEn: { contains: q, mode: "insensitive" } },
                {
                  translations: {
                    some: { name: { contains: q, mode: "insensitive" } },
                  },
                },
                {
                  aliases: {
                    some: { alias: { contains: q, mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
        ...(slotGroup ? { slotGroup: slotGroup as never } : {}),
        ...(systemId ? { systemId } : {}),
        ...(itemTypeId ? { itemTypeId } : {}),
      },
      include: blueprintSummaryInclude,
      orderBy: [{ slotGroup: "asc" }, { canonicalName: "asc" }],
      take: 1000,
    });

    res.json({
      blueprints: blueprints.map(serializeBlueprintSummary),
    });
  }),
);

blueprintsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = createBlueprintSchema.parse(req.body);
    const { nameDe, nameEn, ...blueprintInput } = input;
    const resolvedNameDe = nameDe || input.canonicalName;
    const resolvedNameEn = nameEn === null ? null : nameEn || resolvedNameDe;
    const blueprint = await prisma.blueprint.create({
      data: {
        ...blueprintInput,
        nameDe: resolvedNameDe,
        nameEn: resolvedNameEn,
        translations: {
          create: [
            {
              locale: "de",
              name: resolvedNameDe,
              source: "admin-create",
              verified: true,
            },
            ...(resolvedNameEn
              ? [
                  {
                    locale: "en",
                    name: resolvedNameEn,
                    source: "admin-create",
                    verified: true,
                  },
                ]
              : []),
          ],
        },
      },
      include: blueprintSummaryInclude,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: "blueprint.create",
        entityType: "Blueprint",
        entityId: blueprint.id,
        afterJson: blueprint,
      },
    });

    res.status(201).json({ blueprint });
  }),
);

blueprintsRouter.get(
  "/:blueprintId/members",
  asyncHandler(async (req, res) => {
    const blueprintId = routeParam(req, "blueprintId");
    const clanId = stringQuery(req.query.clanId);
    if (!clanId) {
      throw new HttpError(400, "clanId query parameter is required.");
    }

    const members = await prisma.clanMembership.findMany({
      where: { clanId, status: "ACTIVE" },
      include: {
        user: {
          include: {
            blueprintStatuses: {
              where: { blueprintId },
            },
          },
        },
      },
      orderBy: { user: { displayName: "asc" } },
    });

    res.json({
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.user.displayName,
        role: member.role,
        status: normalizeBlueprintStatus(
          member.user.blueprintStatuses[0]?.status,
        ),
      })),
    });
  }),
);

blueprintsRouter.get(
  "/:blueprintId",
  asyncHandler(async (req, res) => {
    const blueprintId = routeParam(req, "blueprintId");
    const blueprint = await prisma.blueprint.findUnique({
      where: { id: blueprintId },
      include: {
        ...blueprintSummaryInclude,
        aliases: true,
      },
    });

    if (!blueprint) {
      throw new HttpError(404, "Blueprint not found.");
    }

    res.json({ blueprint });
  }),
);
