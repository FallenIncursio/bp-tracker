import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  siriusPlanetAppearance: {
    findMany: vi.fn(),
  },
  clanMembership: {
    findMany: vi.fn(),
  },
  userBlueprintStatus: {
    findMany: vi.fn(),
  },
  blueprintNotificationHit: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  clanDiscordSettings: {
    findMany: vi.fn(),
  },
}));

const notificationMock = vi.hoisted(() => ({
  createNotification: vi.fn(),
}));

vi.mock("../src/utils/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/notifications/notification.service.js", () => notificationMock);

const appearance = {
  id: "appearance-1",
  clanId: "clan-1",
  ring: 5,
  expiresAt: new Date("2026-07-13T10:23:00.000Z"),
  planet: { id: "planet-1", name: "Baltra", sortOrder: 10 },
  slots: [
    {
      id: "slot-1",
      blueprintId: "blueprint-1",
      slotGroup: "SLOT_5",
      enemyType: null,
      createdAt: new Date("2026-07-09T10:00:00.000Z"),
      blueprint: {
        id: "blueprint-1",
        nameDe: "Sirius Angriffsladung",
      },
    },
  ],
};

const mockWantedMatch = () => {
  prismaMock.siriusPlanetAppearance.findMany.mockResolvedValue([appearance]);
  prismaMock.clanMembership.findMany.mockResolvedValue([{ userId: "user-1" }]);
  prismaMock.userBlueprintStatus.findMany.mockResolvedValue([
    { userId: "user-1", blueprintId: "blueprint-1" },
  ]);
};

describe("wanted blueprint alert scanner", () => {
  beforeEach(() => {
    prismaMock.siriusPlanetAppearance.findMany.mockReset();
    prismaMock.clanMembership.findMany.mockReset();
    prismaMock.userBlueprintStatus.findMany.mockReset();
    prismaMock.blueprintNotificationHit.create.mockReset();
    prismaMock.blueprintNotificationHit.update.mockReset();
    prismaMock.blueprintNotificationHit.delete.mockReset();
    prismaMock.blueprintNotificationHit.count.mockReset();
    prismaMock.clanDiscordSettings.findMany.mockReset();
    notificationMock.createNotification.mockReset();
  });

  it("creates one wanted blueprint notification for a new active Sirius hit", async () => {
    const { scanWantedBlueprintAlertsForClan } =
      await import("../src/notifications/blueprint-alerts.service.js");
    mockWantedMatch();
    prismaMock.blueprintNotificationHit.create.mockResolvedValue({
      id: "hit-1",
    });
    prismaMock.blueprintNotificationHit.update.mockResolvedValue({});
    notificationMock.createNotification.mockResolvedValue({
      id: "notification-1",
    });

    await expect(scanWantedBlueprintAlertsForClan("clan-1")).resolves.toEqual({
      mode: "notify",
      evaluated: 1,
      primed: 0,
      sent: 1,
      duplicate: 0,
      failed: 0,
    });

    expect(prismaMock.blueprintNotificationHit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "BLUEPRINT_WANTED_ACTIVE",
        clanId: "clan-1",
        userId: "user-1",
        blueprintId: "blueprint-1",
        appearanceId: "appearance-1",
      }),
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith({
      userId: "user-1",
      clanId: "clan-1",
      type: "BLUEPRINT_WANTED_ACTIVE",
      title: "Wunsch-BP aktiv",
      body: expect.stringContaining(
        "Sirius Angriffsladung ist aktuell auf Baltra",
      ),
      payloadJson: expect.objectContaining({
        source: "wanted-blueprint-alert-scanner",
        blueprintId: "blueprint-1",
        appearanceId: "appearance-1",
      }),
    });
    expect(prismaMock.blueprintNotificationHit.update).toHaveBeenCalledWith({
      where: { id: "hit-1" },
      data: expect.objectContaining({ notificationId: "notification-1" }),
    });
  });

  it("skips duplicates using the notification hit unique key", async () => {
    const { scanWantedBlueprintAlertsForClan } =
      await import("../src/notifications/blueprint-alerts.service.js");
    mockWantedMatch();
    prismaMock.blueprintNotificationHit.create.mockRejectedValue({
      code: "P2002",
    });

    await expect(scanWantedBlueprintAlertsForClan("clan-1")).resolves.toEqual({
      mode: "notify",
      evaluated: 1,
      primed: 0,
      sent: 0,
      duplicate: 1,
      failed: 0,
    });

    expect(notificationMock.createNotification).not.toHaveBeenCalled();
  });

  it("primes existing hits without sending notifications", async () => {
    const { scanWantedBlueprintAlertsForClan } =
      await import("../src/notifications/blueprint-alerts.service.js");
    mockWantedMatch();
    prismaMock.blueprintNotificationHit.create.mockResolvedValue({
      id: "hit-1",
    });

    await expect(
      scanWantedBlueprintAlertsForClan("clan-1", { mode: "prime" }),
    ).resolves.toEqual({
      mode: "prime",
      evaluated: 1,
      primed: 1,
      sent: 0,
      duplicate: 0,
      failed: 0,
    });

    expect(notificationMock.createNotification).not.toHaveBeenCalled();
    expect(prismaMock.blueprintNotificationHit.update).not.toHaveBeenCalled();
  });
});
