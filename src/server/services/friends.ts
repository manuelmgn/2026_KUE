import type {
  FriendListItemDTO,
  RelationshipStatus,
  UserSearchResultDTO,
} from "@/components/features/types";
import { normalizeUsername } from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import {
  type FriendTargetInput,
  friendTargetSchema,
  userSearchQuerySchema,
} from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  getFriendActionRateLimiter,
  type SlidingWindowRateLimiter,
} from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { createNotification } from "@/server/services/notifications";

export function buildFriendshipPairKey(userIdA: string, userIdB: string): string {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

export async function getAcceptedFriendIds(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<string[]> {
  const rows = await db.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addressee: { isActive: true } },
        { addresseeId: userId, requester: { isActive: true } },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });

  return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
}

export async function getRelationshipBetween(
  viewerId: string,
  targetUserId: string,
  db: PrismaClient = getDb(),
): Promise<{ status: RelationshipStatus; friendshipId: string | null }> {
  if (viewerId === targetUserId) {
    return { status: "SELF", friendshipId: null };
  }

  const pairKey = buildFriendshipPairKey(viewerId, targetUserId);
  const row = await db.friendship.findUnique({
    where: { pairKey },
    select: { id: true, requesterId: true, status: true },
  });

  if (!row) {
    return { status: "NONE", friendshipId: null };
  }

  if (row.status === "ACCEPTED") {
    return { status: "FRIENDS", friendshipId: row.id };
  }

  return {
    status: row.requesterId === viewerId ? "OUTGOING_PENDING" : "INCOMING_PENDING",
    friendshipId: row.id,
  };
}

export async function sendFriendRequest(
  actorId: string,
  rawInput: FriendTargetInput,
  options: { db?: PrismaClient; rateLimiter?: SlidingWindowRateLimiter } = {},
): Promise<{ status: "PENDING" | "ACCEPTED"; friendshipId: string }> {
  const input = friendTargetSchema.parse(rawInput);
  if (input.targetUserId === actorId) {
    throw new DomainError("No puedes enviarte una solicitud de amistad a ti mismo");
  }

  const db = options.db ?? getDb();
  const limiter = options.rateLimiter ?? getFriendActionRateLimiter();
  const limit = limiter.check(`friend:${actorId}`);
  if (!limit.allowed) {
    throw new DomainError("Demasiadas solicitudes seguidas. Inténtalo de nuevo en unos minutos.");
  }

  const [actor, target] = await Promise.all([
    db.user.findUnique({
      where: { id: actorId },
      select: { id: true, username: true, displayName: true, isActive: true },
    }),
    db.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, username: true, displayName: true, isActive: true },
    }),
  ]);

  if (!actor?.isActive || !target?.isActive) {
    throw new DomainError("Usuario no encontrado");
  }

  const pairKey = buildFriendshipPairKey(actor.id, target.id);
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.friendship.findUnique({ where: { pairKey } });

    if (existing) {
      if (existing.status === "ACCEPTED") {
        throw new DomainError("Ya sois amigos");
      }
      if (existing.requesterId === actor.id) {
        throw new DomainError("Ya has enviado una solicitud de amistad a este usuario");
      }

      // Crossed request: target already requested actor -> auto-accept!
      const accepted = await tx.friendship.update({
        where: { id: existing.id },
        data: { status: "ACCEPTED", acceptedAt: now },
      });

      await tx.notification.updateMany({
        where: {
          userId: actor.id,
          actorId: target.id,
          type: "FRIEND_REQUEST_RECEIVED",
          readAt: null,
        },
        data: { readAt: now },
      });

      await createNotification(
        {
          userId: target.id,
          type: "FRIEND_REQUEST_ACCEPTED",
          actorId: actor.id,
          payload: {
            actorUsername: actor.username,
            actorDisplayName: actor.displayName,
            friendshipId: accepted.id,
          },
        },
        tx,
      );

      return { status: "ACCEPTED" as const, friendshipId: accepted.id };
    }

    const created = await tx.friendship.create({
      data: {
        pairKey,
        requesterId: actor.id,
        addresseeId: target.id,
        status: "PENDING",
      },
    });

    await createNotification(
      {
        userId: target.id,
        type: "FRIEND_REQUEST_RECEIVED",
        actorId: actor.id,
        payload: {
          actorUsername: actor.username,
          actorDisplayName: actor.displayName,
          friendshipId: created.id,
        },
      },
      tx,
    );

    return { status: "PENDING" as const, friendshipId: created.id };
  });

  limiter.record(`friend:${actor.id}`);
  return result;
}

export async function acceptFriendRequest(
  actorId: string,
  rawInput: FriendTargetInput,
  db: PrismaClient = getDb(),
): Promise<{ friendshipId: string }> {
  const input = friendTargetSchema.parse(rawInput);
  if (input.targetUserId === actorId) {
    throw new DomainError("Solicitud no válida");
  }

  const pairKey = buildFriendshipPairKey(actorId, input.targetUserId);
  const now = new Date();

  return db.$transaction(async (tx) => {
    const [friendship, actor] = await Promise.all([
      tx.friendship.findUnique({ where: { pairKey } }),
      tx.user.findUnique({
        where: { id: actorId },
        select: { id: true, username: true, displayName: true, isActive: true },
      }),
    ]);

    if (!actor?.isActive) {
      throw new DomainError("Usuario no encontrado");
    }

    if (friendship?.status !== "PENDING" || friendship.addresseeId !== actorId) {
      throw new DomainError("No hay ninguna solicitud de amistad pendiente de este usuario");
    }

    await tx.friendship.update({
      where: { id: friendship.id },
      data: { status: "ACCEPTED", acceptedAt: now },
    });

    await tx.notification.updateMany({
      where: {
        userId: actorId,
        actorId: friendship.requesterId,
        type: "FRIEND_REQUEST_RECEIVED",
        readAt: null,
      },
      data: { readAt: now },
    });

    await createNotification(
      {
        userId: friendship.requesterId,
        type: "FRIEND_REQUEST_ACCEPTED",
        actorId: actor.id,
        payload: {
          actorUsername: actor.username,
          actorDisplayName: actor.displayName,
          friendshipId: friendship.id,
        },
      },
      tx,
    );

    return { friendshipId: friendship.id };
  });
}

export async function removeOrRejectFriendship(
  actorId: string,
  rawInput: FriendTargetInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = friendTargetSchema.parse(rawInput);
  if (input.targetUserId === actorId) {
    return;
  }

  const pairKey = buildFriendshipPairKey(actorId, input.targetUserId);

  await db.$transaction(async (tx) => {
    const existing = await tx.friendship.findUnique({
      where: { pairKey },
      select: { id: true, requesterId: true, addresseeId: true },
    });
    if (!existing) {
      throw new DomainError("Relación de amistad no encontrada");
    }

    await tx.friendship.delete({ where: { id: existing.id } });

    // Clean up any unread friend request notifications between these two users
    await tx.notification.deleteMany({
      where: {
        type: "FRIEND_REQUEST_RECEIVED",
        readAt: null,
        OR: [
          { userId: existing.addresseeId, actorId: existing.requesterId },
          { userId: existing.requesterId, actorId: existing.addresseeId },
        ],
      },
    });
  });
}

export async function listFriendsOverview(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<{
  friends: FriendListItemDTO[];
  incomingRequests: FriendListItemDTO[];
  outgoingRequests: FriendListItemDTO[];
}> {
  const [viewer, rows, viewerEditions] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { festivalsVisibility: true },
    }),
    db.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addressee: { isActive: true } },
          { addresseeId: userId, requester: { isActive: true } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            location: true,
            avatarPath: true,
            festivalsVisibility: true,
            editions: { select: { editionId: true } },
          },
        },
        addressee: {
          select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            location: true,
            avatarPath: true,
            festivalsVisibility: true,
            editions: { select: { editionId: true } },
          },
        },
      },
    }),
    db.userFestivalEdition.findMany({
      where: { userId },
      select: { editionId: true },
    }),
  ]);

  const myEditionSet = new Set(viewerEditions.map((e) => e.editionId));
  const viewerSharesFestivals = viewer?.festivalsVisibility === "FRIENDS";

  const friends: FriendListItemDTO[] = [];
  const incomingRequests: FriendListItemDTO[] = [];
  const outgoingRequests: FriendListItemDTO[] = [];

  for (const row of rows) {
    const isOutgoing = row.requesterId === userId;
    const other = isOutgoing ? row.addressee : row.requester;

    const canCountShared =
      row.status === "ACCEPTED" && viewerSharesFestivals && other.festivalsVisibility === "FRIENDS";

    const sharedFestivalsCount = canCountShared
      ? other.editions.reduce((acc, ed) => acc + (myEditionSet.has(ed.editionId) ? 1 : 0), 0)
      : 0;

    const dto: FriendListItemDTO = {
      id: other.id,
      username: other.username,
      displayName: other.displayName,
      bio: other.bio,
      location: other.location,
      avatarPath: other.avatarPath,
      friendshipId: row.id,
      status: row.status,
      direction: isOutgoing ? "OUTGOING" : "INCOMING",
      sharedFestivalsCount,
      createdAt: (row.acceptedAt ?? row.createdAt).toISOString(),
    };

    if (row.status === "ACCEPTED") {
      friends.push(dto);
    } else if (isOutgoing) {
      outgoingRequests.push(dto);
    } else {
      incomingRequests.push(dto);
    }
  }

  friends.sort((a, b) => a.username.localeCompare(b.username));

  return { friends, incomingRequests, outgoingRequests };
}

export async function searchUsersForFriends(
  viewerId: string,
  rawQuery: string,
  db: PrismaClient = getDb(),
): Promise<UserSearchResultDTO[]> {
  const query = userSearchQuerySchema.parse(rawQuery);
  const cleaned = query.replace(/^@+/, "").trim();
  if (cleaned.length < 2) {
    return [];
  }

  const normalized = normalizeUsername(cleaned);
  const lowered = cleaned.toLowerCase();
  const capitalized = lowered.charAt(0).toUpperCase() + lowered.slice(1);
  const displayVariants = Array.from(new Set([cleaned, lowered, capitalized]));

  const candidates = await db.user.findMany({
    where: {
      id: { not: viewerId },
      isActive: true,
      OR: [
        { normalizedUsername: { contains: normalized } },
        ...displayVariants.map((variant) => ({ displayName: { contains: variant } })),
      ],
    },
    orderBy: [{ normalizedUsername: "asc" }],
    take: 20,
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      location: true,
      avatarPath: true,
    },
  });

  if (candidates.length === 0) {
    return [];
  }

  const pairKeys = candidates.map((u) => buildFriendshipPairKey(viewerId, u.id));
  const friendships = await db.friendship.findMany({
    where: { pairKey: { in: pairKeys } },
    select: { id: true, pairKey: true, requesterId: true, status: true },
  });
  const byPairKey = new Map(friendships.map((f) => [f.pairKey, f]));

  return candidates.map((candidate) => {
    const f = byPairKey.get(buildFriendshipPairKey(viewerId, candidate.id));
    let relationship: RelationshipStatus = "NONE";
    if (f) {
      if (f.status === "ACCEPTED") {
        relationship = "FRIENDS";
      } else {
        relationship = f.requesterId === viewerId ? "OUTGOING_PENDING" : "INCOMING_PENDING";
      }
    }

    return {
      id: candidate.id,
      username: candidate.username,
      displayName: candidate.displayName,
      bio: candidate.bio,
      location: candidate.location,
      avatarPath: candidate.avatarPath,
      relationship,
      friendshipId: f?.id ?? null,
    };
  });
}
