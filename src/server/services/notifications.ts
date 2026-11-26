import type { NotificationItemDTO, NotificationsSnapshotDTO } from "@/components/features/types";
import { DomainError } from "@/domain/errors";
import {
  type NotificationIdInput,
  type NotificationPayload,
  type NotificationType,
  notificationIdSchema,
  notificationPayloadSchema,
} from "@/domain/schemas";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

type DbOrTx = PrismaClient | Prisma.TransactionClient;

export function parseNotificationPayload(raw: string | null | undefined): NotificationPayload {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    const result = notificationPayloadSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export function serializeNotificationPayload(payload: NotificationPayload): string {
  const checked = notificationPayloadSchema.parse(payload);
  return JSON.stringify(checked);
}

export async function createNotification(
  params: {
    userId: string;
    type: NotificationType;
    actorId?: string | null;
    editionId?: string | null;
    payload?: NotificationPayload;
  },
  db: DbOrTx = getDb(),
): Promise<void> {
  if (params.actorId && params.actorId === params.userId) {
    return;
  }

  await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      actorId: params.actorId ?? null,
      editionId: params.editionId ?? null,
      payload: serializeNotificationPayload(params.payload ?? {}),
    },
  });
}

/**
 * Notifies active followers of a festival edition when new lineup entries or schedule updates
 * are applied. Coalesces into an existing unread notification for the same edition when present.
 */
export async function notifyFestivalLineupUpdated(
  editionId: string,
  counts: { addedCount: number; updatedCount: number },
  options: { excludeUserId?: string | null; db?: PrismaClient } = {},
): Promise<number> {
  if (counts.addedCount <= 0 && counts.updatedCount <= 0) {
    return 0;
  }

  const db = options.db ?? getDb();
  const edition = await db.festivalEdition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      slug: true,
      year: true,
      festival: { select: { name: true } },
      followers: {
        where: {
          user: { isActive: true },
          ...(options.excludeUserId ? { userId: { not: options.excludeUserId } } : {}),
        },
        select: { userId: true },
      },
    },
  });

  if (!edition || edition.followers.length === 0) {
    return 0;
  }

  const recipientIds = edition.followers.map((f) => f.userId);
  const existingUnread = await db.notification.findMany({
    where: {
      userId: { in: recipientIds },
      editionId: edition.id,
      type: "FESTIVAL_LINEUP_UPDATED",
      readAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  const unreadByUser = new Map<string, (typeof existingUnread)[number]>();
  for (const item of existingUnread) {
    if (!unreadByUser.has(item.userId)) {
      unreadByUser.set(item.userId, item);
    }
  }

  const now = new Date();
  let notified = 0;

  await db.$transaction(async (tx) => {
    for (const recipientId of recipientIds) {
      const prev = unreadByUser.get(recipientId);
      if (prev) {
        const prevPayload = parseNotificationPayload(prev.payload);
        const mergedPayload: NotificationPayload = {
          festivalName: edition.festival.name,
          festivalYear: edition.year,
          festivalSlug: edition.slug,
          addedCount: (prevPayload.addedCount ?? 0) + counts.addedCount,
          updatedCount: (prevPayload.updatedCount ?? 0) + counts.updatedCount,
        };
        await tx.notification.update({
          where: { id: prev.id },
          data: {
            payload: serializeNotificationPayload(mergedPayload),
            createdAt: now,
          },
        });
      } else {
        await tx.notification.create({
          data: {
            userId: recipientId,
            type: "FESTIVAL_LINEUP_UPDATED",
            editionId: edition.id,
            payload: serializeNotificationPayload({
              festivalName: edition.festival.name,
              festivalYear: edition.year,
              festivalSlug: edition.slug,
              addedCount: counts.addedCount,
              updatedCount: counts.updatedCount,
            }),
            createdAt: now,
          },
        });
      }
      notified += 1;
    }
  });

  return notified;
}

/**
 * Notifies active followers when festival dates or location change.
 */
export async function notifyFestivalMetadataUpdated(
  editionId: string,
  options: { excludeUserId?: string | null; db?: PrismaClient } = {},
): Promise<number> {
  const db = options.db ?? getDb();
  const edition = await db.festivalEdition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      slug: true,
      year: true,
      festival: { select: { name: true } },
      followers: {
        where: {
          user: { isActive: true },
          ...(options.excludeUserId ? { userId: { not: options.excludeUserId } } : {}),
        },
        select: { userId: true },
      },
    },
  });

  if (!edition || edition.followers.length === 0) {
    return 0;
  }

  const recipientIds = edition.followers.map((f) => f.userId);
  const existingUnread = await db.notification.findMany({
    where: {
      userId: { in: recipientIds },
      editionId: edition.id,
      type: "FESTIVAL_METADATA_UPDATED",
      readAt: null,
    },
    select: { id: true, userId: true },
  });
  const unreadByUser = new Map(existingUnread.map((n) => [n.userId, n.id]));
  const now = new Date();
  const payload = serializeNotificationPayload({
    festivalName: edition.festival.name,
    festivalYear: edition.year,
    festivalSlug: edition.slug,
  });

  await db.$transaction(async (tx) => {
    for (const recipientId of recipientIds) {
      const existingId = unreadByUser.get(recipientId);
      if (existingId) {
        await tx.notification.update({
          where: { id: existingId },
          data: { payload, createdAt: now },
        });
      } else {
        await tx.notification.create({
          data: {
            userId: recipientId,
            type: "FESTIVAL_METADATA_UPDATED",
            editionId: edition.id,
            payload,
            createdAt: now,
          },
        });
      }
    }
  });

  return recipientIds.length;
}

/**
 * When a user adds a festival edition, notifies accepted friends who also follow that edition
 * (only when both users share festival visibility with friends).
 */
export async function notifyFriendsJoinedFestival(
  actorUserId: string,
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<number> {
  const [actor, edition, friendships] = await Promise.all([
    db.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        festivalsVisibility: true,
      },
    }),
    db.festivalEdition.findUnique({
      where: { id: editionId },
      select: {
        id: true,
        slug: true,
        year: true,
        festival: { select: { name: true } },
      },
    }),
    db.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: actorUserId }, { addresseeId: actorUserId }],
      },
      select: { requesterId: true, addresseeId: true },
    }),
  ]);

  if (!actor?.isActive || actor.festivalsVisibility !== "FRIENDS" || !edition) {
    return 0;
  }

  const friendIds = friendships.map((f) =>
    f.requesterId === actorUserId ? f.addresseeId : f.requesterId,
  );
  if (friendIds.length === 0) {
    return 0;
  }

  const matchingFollowers = await db.userFestivalEdition.findMany({
    where: {
      editionId: edition.id,
      userId: { in: friendIds },
      user: {
        isActive: true,
        festivalsVisibility: "FRIENDS",
      },
    },
    select: { userId: true },
  });

  if (matchingFollowers.length === 0) {
    return 0;
  }

  const targetIds = matchingFollowers.map((m) => m.userId);
  const existingUnread = await db.notification.findMany({
    where: {
      userId: { in: targetIds },
      actorId: actor.id,
      editionId: edition.id,
      type: "FRIEND_JOINED_FESTIVAL",
      readAt: null,
    },
    select: { userId: true },
  });
  const alreadyNotified = new Set(existingUnread.map((n) => n.userId));

  const toCreate = targetIds.filter((uid) => !alreadyNotified.has(uid));
  if (toCreate.length === 0) {
    return 0;
  }

  const payload = serializeNotificationPayload({
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    festivalName: edition.festival.name,
    festivalYear: edition.year,
    festivalSlug: edition.slug,
  });

  await db.$transaction(
    toCreate.map((recipientId) =>
      db.notification.create({
        data: {
          userId: recipientId,
          type: "FRIEND_JOINED_FESTIVAL",
          actorId: actor.id,
          editionId: edition.id,
          payload,
        },
      }),
    ),
  );

  return toCreate.length;
}

export async function getUnreadNotificationCount(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<number> {
  return db.notification.count({
    where: { userId, readAt: null },
  });
}

export async function listUserNotifications(
  userId: string,
  options: { limit?: number; db?: PrismaClient } = {},
): Promise<NotificationsSnapshotDTO> {
  const db = options.db ?? getDb();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const [unreadCount, rows] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const requestActorIds = Array.from(
    new Set(
      rows
        .filter((r) => r.type === "FRIEND_REQUEST_RECEIVED" && r.actorId)
        .map((r) => r.actorId as string),
    ),
  );

  const pendingByRequester = new Map<string, string>();
  if (requestActorIds.length > 0) {
    const pendingRows = await db.friendship.findMany({
      where: {
        addresseeId: userId,
        requesterId: { in: requestActorIds },
        status: "PENDING",
      },
      select: { id: true, requesterId: true },
    });
    for (const p of pendingRows) {
      pendingByRequester.set(p.requesterId, p.id);
    }
  }

  const items: NotificationItemDTO[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    actorId: row.actorId,
    editionId: row.editionId,
    payload: parseNotificationPayload(row.payload),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    pendingFriendshipId:
      row.type === "FRIEND_REQUEST_RECEIVED" && row.actorId
        ? (pendingByRequester.get(row.actorId) ?? null)
        : null,
  }));

  return { unreadCount, items };
}

export async function markNotificationRead(
  userId: string,
  rawInput: NotificationIdInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = notificationIdSchema.parse(rawInput);
  const existing = await db.notification.findUnique({
    where: { id: input.notificationId },
    select: { id: true, userId: true, readAt: true },
  });
  if (!existing || existing.userId !== userId) {
    throw new DomainError("Notificación no encontrada");
  }
  if (!existing.readAt) {
    await db.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
  }
}

export async function markAllNotificationsRead(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<number> {
  const res = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}
