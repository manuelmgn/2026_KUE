import { DomainError, ForbiddenError } from "@/domain/errors";
import {
  buildComparisonMatrix,
  type CoincidingFestivalDTO,
  type CoincidingFriendDTO,
  FESTIVAL_RECOMMENDATION_THRESHOLD,
  type FestivalComparisonTableDTO,
  type GroupEditionSummaryDTO,
  type GroupParticipantDTO,
  type JointAgendaDetailDTO,
  type JointAgendaSummaryDTO,
  organizeJointAgendaEntries,
  type RawComparisonEntryInput,
  type RawComparisonParticipantInput,
  type SavedFestivalComparisonDTO,
  type SavedFestivalComparisonSummaryDTO,
  selectEntriesForJointAgenda,
} from "@/domain/group-planning";
import {
  type ComparisonSortMode,
  type CreateFestivalComparisonInput,
  type CreateJointAgendaInput,
  createFestivalComparisonSchema,
  createJointAgendaSchema,
  type FestivalComparisonIdInput,
  type FestivalComparisonQueryInput,
  festivalComparisonIdSchema,
  festivalComparisonQuerySchema,
  type JointAgendaIdInput,
  jointAgendaIdSchema,
  type RegenerateJointAgendaInput,
  regenerateJointAgendaSchema,
  type SetJointAgendaEntryInput,
  setJointAgendaEntrySchema,
  type UpdateFestivalComparisonInput,
  type UpdateJointAgendaInput,
  updateFestivalComparisonSchema,
  updateJointAgendaSchema,
} from "@/domain/schemas";
import type { PrismaClient, VisibilityScope } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { getAcceptedFriendIds } from "@/server/services/friends";

interface ParticipantUserRecord {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  isActive: boolean;
  festivalsVisibility: VisibilityScope;
  ratingsVisibility: VisibilityScope;
}

interface EditionWithBrandRecord {
  id: string;
  slug: string;
  year: number;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  festival: {
    id: string;
    slug: string;
    name: string;
  };
}

function toEditionSummaryDTO(edition: EditionWithBrandRecord): GroupEditionSummaryDTO {
  return {
    id: edition.id,
    festivalId: edition.festival.id,
    brandSlug: edition.festival.slug,
    slug: edition.slug,
    name: edition.festival.name,
    year: edition.year,
    location: edition.location,
    startDate: edition.startDate ? edition.startDate.toISOString().slice(0, 10) : null,
    endDate: edition.endDate ? edition.endDate.toISOString().slice(0, 10) : null,
  };
}

function toGroupParticipantDTO(user: ParticipantUserRecord): GroupParticipantDTO {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarPath: user.avatarPath,
  };
}

const participantUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarPath: true,
  isActive: true,
  festivalsVisibility: true,
  ratingsVisibility: true,
} as const;

const editionWithBrandSelect = {
  id: true,
  slug: true,
  year: true,
  location: true,
  startDate: true,
  endDate: true,
  festival: {
    select: {
      id: true,
      slug: true,
      name: true,
    },
  },
} as const;

async function resolveViewerAndEdition(
  viewerId: string,
  editionId: string,
  options: { requireViewerSharesFestivals: boolean },
  db: PrismaClient,
): Promise<{ viewer: ParticipantUserRecord; edition: EditionWithBrandRecord }> {
  const [viewer, edition, membership] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: participantUserSelect,
    }),
    db.festivalEdition.findUnique({
      where: { id: editionId },
      select: editionWithBrandSelect,
    }),
    db.userFestivalEdition.findUnique({
      where: { userId_editionId: { userId: viewerId, editionId } },
      select: { editionId: true },
    }),
  ]);

  if (!viewer?.isActive) {
    throw new DomainError("Usuario no encontrado");
  }
  if (!edition) {
    throw new DomainError("Edición de festival no encontrada");
  }
  if (!membership) {
    throw new DomainError(
      "Debes tener este festival añadido en tu lista para compararlo o crear una agenda conjunta",
    );
  }
  if (options.requireViewerSharesFestivals && viewer.festivalsVisibility !== "FRIENDS") {
    throw new DomainError(
      "Activa la visibilidad de tus festivales para amigos antes de compartir comparativas o agendas conjuntas",
    );
  }

  return { viewer, edition };
}

async function resolveCoincidingFriendsForViewer(
  viewerId: string,
  editionId: string,
  requestedFriendIds: ReadonlyArray<string> | undefined,
  db: PrismaClient,
): Promise<ParticipantUserRecord[]> {
  const acceptedFriendIds = await getAcceptedFriendIds(viewerId, db);
  if (acceptedFriendIds.length === 0) {
    throw new DomainError(
      "Necesitas coincidir con al menos un amigo en este festival para generar la tabla comparativa",
    );
  }

  const eligibleFriends = await db.user.findMany({
    where: {
      id: { in: acceptedFriendIds },
      isActive: true,
      festivalsVisibility: "FRIENDS",
      editions: { some: { editionId } },
    },
    orderBy: [{ normalizedUsername: "asc" }],
    select: participantUserSelect,
  });

  const eligibleById = new Map(eligibleFriends.map((f) => [f.id, f]));

  if (requestedFriendIds !== undefined && requestedFriendIds.length > 0) {
    const deduplicated: string[] = [];
    const seen = new Set<string>();
    for (const rawId of requestedFriendIds) {
      const id = rawId.trim();
      if (!id || id === viewerId || seen.has(id)) continue;
      seen.add(id);
      deduplicated.push(id);
    }

    if (deduplicated.length === 0) {
      throw new DomainError("Selecciona al menos un amigo con quien coincidas en el festival");
    }

    const selected: ParticipantUserRecord[] = [];
    for (const fid of deduplicated) {
      const friend = eligibleById.get(fid);
      if (!friend) {
        throw new DomainError(
          "Todos los participantes seleccionados deben ser amigos activos que coincidan públicamente en este festival",
        );
      }
      selected.push(friend);
    }
    return selected;
  }

  if (eligibleFriends.length === 0) {
    throw new DomainError(
      "Necesitas coincidir con al menos un amigo en este festival para generar la tabla comparativa",
    );
  }

  return eligibleFriends;
}

async function filterVisibleStoredMembers(
  viewer: ParticipantUserRecord,
  editionId: string,
  storedUsers: ReadonlyArray<ParticipantUserRecord>,
  db: PrismaClient,
): Promise<ParticipantUserRecord[]> {
  const otherCandidates = storedUsers.filter(
    (u) => u.id !== viewer.id && u.isActive && u.festivalsVisibility === "FRIENDS",
  );
  if (otherCandidates.length === 0) {
    return [viewer];
  }

  const candidateIds = otherCandidates.map((u) => u.id);
  const [acceptedFriendIds, activeFollowers] = await Promise.all([
    getAcceptedFriendIds(viewer.id, db),
    db.userFestivalEdition.findMany({
      where: {
        editionId,
        userId: { in: candidateIds },
      },
      select: { userId: true },
    }),
  ]);

  const friendSet = new Set(acceptedFriendIds);
  const followerSet = new Set(activeFollowers.map((f) => f.userId));

  const visibleOthers = otherCandidates
    .filter((u) => friendSet.has(u.id) && followerSet.has(u.id))
    .sort((a, b) => a.username.localeCompare(b.username));

  return [viewer, ...visibleOthers];
}

async function resolveBatchVisibleMembers<
  TRow extends {
    editionId: string;
    createdById: string;
    members: ReadonlyArray<{ user: ParticipantUserRecord }>;
  },
>(
  viewer: ParticipantUserRecord,
  rows: ReadonlyArray<TRow>,
  db: PrismaClient,
): Promise<Array<{ row: TRow; visibleUsers: ParticipantUserRecord[] }>> {
  if (rows.length === 0) {
    return [];
  }

  const editionIdSet = new Set<string>();
  const candidateIdSet = new Set<string>();

  for (const row of rows) {
    editionIdSet.add(row.editionId);
    for (const m of row.members) {
      if (m.user.id !== viewer.id && m.user.isActive && m.user.festivalsVisibility === "FRIENDS") {
        candidateIdSet.add(m.user.id);
      }
    }
  }

  const candidateIds = Array.from(candidateIdSet);
  const [acceptedFriendIds, activeFollows] =
    candidateIds.length > 0
      ? await Promise.all([
          getAcceptedFriendIds(viewer.id, db),
          db.userFestivalEdition.findMany({
            where: {
              editionId: { in: Array.from(editionIdSet) },
              userId: { in: candidateIds },
            },
            select: { editionId: true, userId: true },
          }),
        ])
      : [[], []];

  const friendSet = new Set(acceptedFriendIds);
  const editionUserPairs = new Set(activeFollows.map((f) => `${f.editionId}:${f.userId}`));

  const resolved: Array<{ row: TRow; visibleUsers: ParticipantUserRecord[] }> = [];
  for (const row of rows) {
    const visibleOthers = row.members
      .map((m) => m.user)
      .filter(
        (u) =>
          u.id !== viewer.id &&
          u.isActive &&
          u.festivalsVisibility === "FRIENDS" &&
          friendSet.has(u.id) &&
          editionUserPairs.has(`${row.editionId}:${u.id}`),
      )
      .sort((a, b) => a.username.localeCompare(b.username));

    const visibleUsers = [viewer, ...visibleOthers];

    // If viewer is not the creator and the creator is no longer visible (unfriended, private, or left festival), hide
    if (viewer.id !== row.createdById && !visibleUsers.some((u) => u.id === row.createdById)) {
      continue;
    }

    resolved.push({ row, visibleUsers });
  }

  return resolved;
}

async function hydrateComparisonTable(params: {
  viewer: ParticipantUserRecord;
  edition: EditionWithBrandRecord;
  participantUsers: ReadonlyArray<ParticipantUserRecord>;
  sortBy?: ComparisonSortMode;
  onlyRated?: boolean;
  recommendationThreshold?: number;
  db: PrismaClient;
}): Promise<FestivalComparisonTableDTO> {
  const { viewer, edition, participantUsers, db } = params;

  const entries = await db.festivalEntry.findMany({
    where: { editionId: edition.id },
    orderBy: [{ sortOrder: "asc" }, { billingName: "asc" }],
    include: {
      artists: {
        orderBy: { position: "asc" },
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              imagePath: true,
            },
          },
        },
      },
    },
  });

  const artistIdSet = new Set<string>();
  const entryIds: string[] = [];
  const rawEntries: RawComparisonEntryInput[] = entries.map((entry) => {
    entryIds.push(entry.id);
    const linkedArtists = entry.artists.map((link) => {
      artistIdSet.add(link.artist.id);
      return {
        id: link.artist.id,
        name: link.artist.name,
        imagePath: link.artist.imagePath,
      };
    });

    return {
      id: entry.id,
      billingName: entry.billingName,
      subtitle: entry.subtitle,
      day: entry.day,
      stage: entry.stage,
      setTime: entry.setTime,
      sortOrder: entry.sortOrder,
      artists: linkedArtists,
    };
  });

  const ratingVisibleUserIds = participantUsers
    .filter((u) => u.id === viewer.id || u.ratingsVisibility === "FRIENDS")
    .map((u) => u.id);

  const uniqueArtistIds = Array.from(artistIdSet);

  const [artistStates, entryStates] = await Promise.all([
    ratingVisibleUserIds.length > 0 && uniqueArtistIds.length > 0
      ? db.userArtistState.findMany({
          where: {
            userId: { in: ratingVisibleUserIds },
            artistId: { in: uniqueArtistIds },
          },
          select: {
            userId: true,
            artistId: true,
            rating: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    ratingVisibleUserIds.length > 0 && entryIds.length > 0
      ? db.userEntryState.findMany({
          where: {
            userId: { in: ratingVisibleUserIds },
            entryId: { in: entryIds },
            liveRating: { not: null },
          },
          select: {
            userId: true,
            entryId: true,
            liveRating: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const artistStatesByUser = new Map<
    string,
    Map<string, { rating: number | null; status: (typeof artistStates)[number]["status"] }>
  >();
  for (const state of artistStates) {
    let byArtist = artistStatesByUser.get(state.userId);
    if (!byArtist) {
      byArtist = new Map();
      artistStatesByUser.set(state.userId, byArtist);
    }
    byArtist.set(state.artistId, { rating: state.rating, status: state.status });
  }

  const liveRatingsByUser = new Map<string, Map<string, number | null>>();
  for (const state of entryStates) {
    let byEntry = liveRatingsByUser.get(state.userId);
    if (!byEntry) {
      byEntry = new Map();
      liveRatingsByUser.set(state.userId, byEntry);
    }
    byEntry.set(state.entryId, state.liveRating);
  }

  const rawParticipants: RawComparisonParticipantInput[] = participantUsers.map((u) => {
    const isViewer = u.id === viewer.id;
    const ratingsVisible = isViewer || u.ratingsVisibility === "FRIENDS";
    return {
      user: toGroupParticipantDTO(u),
      isViewer,
      ratingsVisible,
      artistStates: ratingsVisible ? (artistStatesByUser.get(u.id) ?? new Map()) : new Map(),
      entryLiveRatings: ratingsVisible ? (liveRatingsByUser.get(u.id) ?? new Map()) : new Map(),
    };
  });

  return buildComparisonMatrix({
    edition: toEditionSummaryDTO(edition),
    entries: rawEntries,
    participants: rawParticipants,
    ...(params.sortBy !== undefined ? { sortBy: params.sortBy } : {}),
    ...(params.onlyRated !== undefined ? { onlyRated: params.onlyRated } : {}),
    ...(params.recommendationThreshold !== undefined
      ? { recommendationThreshold: params.recommendationThreshold }
      : {}),
  });
}

/**
 * Lists all festival editions followed by `viewerId` where at least one accepted friend
 * (with `festivalsVisibility = FRIENDS`) also follows the edition.
 */
export async function listCoincidingFestivals(
  viewerId: string,
  db: PrismaClient = getDb(),
): Promise<CoincidingFestivalDTO[]> {
  const [myMemberships, friendIds] = await Promise.all([
    db.userFestivalEdition.findMany({
      where: { userId: viewerId },
      include: {
        edition: {
          include: {
            festival: { select: { id: true, slug: true, name: true } },
            _count: { select: { entries: true } },
          },
        },
      },
      orderBy: [{ edition: { year: "desc" } }, { addedAt: "desc" }],
    }),
    getAcceptedFriendIds(viewerId, db),
  ]);

  if (myMemberships.length === 0 || friendIds.length === 0) {
    return [];
  }

  const editionIds = myMemberships.map((m) => m.editionId);

  const [friendMemberships, myComparisons, myAgendas] = await Promise.all([
    db.userFestivalEdition.findMany({
      where: {
        editionId: { in: editionIds },
        userId: { in: friendIds },
        user: {
          isActive: true,
          festivalsVisibility: "FRIENDS",
        },
      },
      include: {
        user: {
          select: participantUserSelect,
        },
      },
      orderBy: {
        user: { normalizedUsername: "asc" },
      },
    }),
    db.festivalComparison.findMany({
      where: {
        editionId: { in: editionIds },
        members: { some: { userId: viewerId } },
      },
      select: { editionId: true },
    }),
    db.jointAgenda.findMany({
      where: {
        editionId: { in: editionIds },
        members: { some: { userId: viewerId } },
      },
      select: { editionId: true },
    }),
  ]);

  const friendsByEdition = new Map<string, CoincidingFriendDTO[]>();
  for (const fm of friendMemberships) {
    const list = friendsByEdition.get(fm.editionId) ?? [];
    list.push({
      id: fm.user.id,
      username: fm.user.username,
      displayName: fm.user.displayName,
      avatarPath: fm.user.avatarPath,
      ratingsVisible: fm.user.ratingsVisibility === "FRIENDS",
    });
    friendsByEdition.set(fm.editionId, list);
  }

  const comparisonsCountByEdition = new Map<string, number>();
  for (const c of myComparisons) {
    comparisonsCountByEdition.set(
      c.editionId,
      (comparisonsCountByEdition.get(c.editionId) ?? 0) + 1,
    );
  }

  const agendasCountByEdition = new Map<string, number>();
  for (const a of myAgendas) {
    agendasCountByEdition.set(a.editionId, (agendasCountByEdition.get(a.editionId) ?? 0) + 1);
  }

  const results: CoincidingFestivalDTO[] = [];
  for (const m of myMemberships) {
    const coincidingFriends = friendsByEdition.get(m.editionId) ?? [];
    if (coincidingFriends.length === 0) continue;

    results.push({
      edition: toEditionSummaryDTO(m.edition),
      entriesCount: m.edition._count.entries,
      coincidingFriends,
      savedComparisonsCount: comparisonsCountByEdition.get(m.editionId) ?? 0,
      jointAgendasCount: agendasCountByEdition.get(m.editionId) ?? 0,
    });
  }

  return results;
}

/**
 * Computes an on-demand comparative rating table and automatic festival recommendation (`>= 3.2`)
 * between `viewerId` and one or more coinciding friends on `editionId`.
 */
export async function getFestivalComparison(
  viewerId: string,
  rawInput: FestivalComparisonQueryInput,
  db: PrismaClient = getDb(),
): Promise<FestivalComparisonTableDTO> {
  const input = festivalComparisonQuerySchema.parse(rawInput);

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    input.editionId,
    { requireViewerSharesFestivals: false },
    db,
  );

  const friends = await resolveCoincidingFriendsForViewer(
    viewerId,
    edition.id,
    input.friendIds,
    db,
  );

  return hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: [viewer, ...friends],
    ...(input.sortBy !== undefined ? { sortBy: input.sortBy } : {}),
    ...(input.onlyRated !== undefined ? { onlyRated: input.onlyRated } : {}),
    db,
  });
}

/**
 * Persists a comparative table configuration (`FestivalComparison`) shared between `viewerId`
 * and one or more coinciding friends, returning the live-hydrated table and `>= 3.2` recommendation.
 */
export async function createFestivalComparison(
  viewerId: string,
  rawInput: CreateFestivalComparisonInput,
  db: PrismaClient = getDb(),
): Promise<SavedFestivalComparisonDTO> {
  const input = createFestivalComparisonSchema.parse(rawInput);

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    input.editionId,
    { requireViewerSharesFestivals: true },
    db,
  );

  const friends = await resolveCoincidingFriendsForViewer(
    viewerId,
    edition.id,
    input.friendIds,
    db,
  );

  const name = input.name?.trim() || `${edition.festival.name} ${edition.year} · Comparativa`;
  const memberIds = [viewer.id, ...friends.map((f) => f.id)];

  const created = await db.festivalComparison.create({
    data: {
      editionId: edition.id,
      createdById: viewer.id,
      name,
      members: {
        create: memberIds.map((userId) => ({ userId })),
      },
    },
  });

  const table = await hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: [viewer, ...friends],
    db,
  });

  return {
    ...table,
    id: created.id,
    name: created.name,
    createdById: created.createdById,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

/**
 * Lists persisted `FestivalComparison` records where `viewerId` is a member and still follows
 * the festival edition, filtering visible participant metadata according to live privacy rules.
 */
export async function listSavedFestivalComparisons(
  viewerId: string,
  options: { editionId?: string; db?: PrismaClient } = {},
): Promise<SavedFestivalComparisonSummaryDTO[]> {
  const db = options.db ?? getDb();

  const [viewer, viewerEditions] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: participantUserSelect,
    }),
    db.userFestivalEdition.findMany({
      where: {
        userId: viewerId,
        ...(options.editionId !== undefined ? { editionId: options.editionId } : {}),
      },
      select: { editionId: true },
    }),
  ]);

  if (!viewer?.isActive || viewerEditions.length === 0) {
    return [];
  }

  const followedEditionIds = viewerEditions.map((e) => e.editionId);

  const rows = await db.festivalComparison.findMany({
    where: {
      editionId: { in: followedEditionIds },
      members: { some: { userId: viewerId } },
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      edition: { select: editionWithBrandSelect },
      members: {
        include: { user: { select: participantUserSelect } },
      },
      _count: { select: { jointAgendas: true } },
    },
  });

  const resolvedRows = await resolveBatchVisibleMembers(viewer, rows, db);

  return resolvedRows.map(({ row, visibleUsers }) => ({
    id: row.id,
    name: row.name,
    createdById: row.createdById,
    edition: toEditionSummaryDTO(row.edition),
    participants: visibleUsers.map(toGroupParticipantDTO),
    jointAgendasCount: row._count.jointAgendas,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Retrieves a saved `FestivalComparison` hydrated with live ratings and automatic `>= 3.2`
 * recommendation, strictly enforcing current friendship and privacy rules.
 */
export async function getSavedFestivalComparison(
  viewerId: string,
  comparisonId: string,
  options: { sortBy?: ComparisonSortMode; onlyRated?: boolean; db?: PrismaClient } = {},
): Promise<SavedFestivalComparisonDTO> {
  const parsed = festivalComparisonIdSchema.parse({ comparisonId });
  const db = options.db ?? getDb();

  const row = await db.festivalComparison.findUnique({
    where: { id: parsed.comparisonId },
    include: {
      edition: { select: editionWithBrandSelect },
      members: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });

  if (!row) {
    throw new DomainError("Tabla comparativa no encontrada");
  }

  const isMember = row.members.some((m) => m.userId === viewerId);
  if (!isMember) {
    throw new ForbiddenError("No tienes acceso a esta tabla comparativa");
  }

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    row.editionId,
    { requireViewerSharesFestivals: false },
    db,
  );

  const visibleUsers = await filterVisibleStoredMembers(
    viewer,
    edition.id,
    row.members.map((m) => m.user),
    db,
  );

  if (viewer.id !== row.createdById && !visibleUsers.some((u) => u.id === row.createdById)) {
    throw new ForbiddenError("No tienes acceso a esta tabla comparativa");
  }

  const table = await hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: visibleUsers,
    ...(options.sortBy !== undefined ? { sortBy: options.sortBy } : {}),
    ...(options.onlyRated !== undefined ? { onlyRated: options.onlyRated } : {}),
    db,
  });

  return {
    ...table,
    id: row.id,
    name: row.name,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateFestivalComparison(
  viewerId: string,
  rawInput: UpdateFestivalComparisonInput,
  db: PrismaClient = getDb(),
): Promise<SavedFestivalComparisonDTO> {
  const input = updateFestivalComparisonSchema.parse(rawInput);

  const existing = await db.festivalComparison.findUnique({
    where: { id: input.comparisonId },
    include: {
      edition: { select: editionWithBrandSelect },
    },
  });

  if (!existing) {
    throw new DomainError("Tabla comparativa no encontrada");
  }
  if (existing.createdById !== viewerId) {
    throw new ForbiddenError("Solo quien creó la tabla comparativa puede editarla");
  }

  const { viewer } = await resolveViewerAndEdition(
    viewerId,
    existing.editionId,
    { requireViewerSharesFestivals: true },
    db,
  );

  const nextFriends =
    input.friendIds !== undefined
      ? await resolveCoincidingFriendsForViewer(viewerId, existing.editionId, input.friendIds, db)
      : null;

  await db.$transaction(async (tx) => {
    const nextName =
      input.name !== undefined
        ? input.name.trim() ||
          `${existing.edition.festival.name} ${existing.edition.year} · Comparativa`
        : existing.name;

    await tx.festivalComparison.update({
      where: { id: existing.id },
      data: { name: nextName },
    });

    if (nextFriends !== null) {
      const desiredIds = new Set([viewer.id, ...nextFriends.map((f) => f.id)]);
      await tx.festivalComparisonMember.deleteMany({
        where: {
          comparisonId: existing.id,
          userId: { notIn: Array.from(desiredIds) },
        },
      });
      for (const uid of desiredIds) {
        await tx.festivalComparisonMember.upsert({
          where: { comparisonId_userId: { comparisonId: existing.id, userId: uid } },
          create: { comparisonId: existing.id, userId: uid },
          update: {},
        });
      }
    }
  });

  return getSavedFestivalComparison(viewerId, existing.id, { db });
}

export async function deleteFestivalComparison(
  viewerId: string,
  rawInput: FestivalComparisonIdInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = festivalComparisonIdSchema.parse(rawInput);

  const existing = await db.festivalComparison.findUnique({
    where: { id: input.comparisonId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new DomainError("Tabla comparativa no encontrada");
  }
  if (existing.createdById !== viewerId) {
    throw new ForbiddenError("Solo quien creó la tabla comparativa puede eliminarla");
  }

  await db.festivalComparison.delete({ where: { id: existing.id } });
}

/**
 * Creates a Joint Agenda (`JointAgenda`) from either a saved `comparisonId` or a direct
 * festival coincidence (`editionId` + `friendIds`), seeding concerts based on `strategy`
 * (defaults to `"RECOMMENDED"`, i.e., group average rating `>= 3.2`).
 */
export async function createJointAgenda(
  viewerId: string,
  rawInput: CreateJointAgendaInput,
  db: PrismaClient = getDb(),
): Promise<JointAgendaDetailDTO> {
  const input = createJointAgendaSchema.parse(rawInput);

  let resolvedEditionId = input.editionId ?? "";
  let linkedComparisonId: string | null = null;
  let comparisonFriendIds: string[] | undefined;

  if (input.comparisonId) {
    const comparison = await db.festivalComparison.findUnique({
      where: { id: input.comparisonId },
      include: {
        members: { select: { userId: true } },
      },
    });
    if (!comparison) {
      throw new DomainError("Tabla comparativa no encontrada");
    }
    const isComparisonMember = comparison.members.some((m) => m.userId === viewerId);
    if (!isComparisonMember) {
      throw new ForbiddenError("No tienes acceso a esta tabla comparativa");
    }
    if (input.editionId && input.editionId !== comparison.editionId) {
      throw new DomainError(
        "La edición de festival indicada no coincide con la de la tabla comparativa",
      );
    }
    resolvedEditionId = comparison.editionId;
    linkedComparisonId = comparison.id;
    if (input.friendIds === undefined) {
      const otherIds = comparison.members.map((m) => m.userId).filter((uid) => uid !== viewerId);
      if (otherIds.length > 0) {
        comparisonFriendIds = otherIds;
      }
    }
  }

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    resolvedEditionId,
    { requireViewerSharesFestivals: true },
    db,
  );

  const requestedFriends = input.friendIds ?? comparisonFriendIds;
  const friends = await resolveCoincidingFriendsForViewer(
    viewerId,
    edition.id,
    requestedFriends,
    db,
  );

  const threshold = input.minRatingThreshold ?? FESTIVAL_RECOMMENDATION_THRESHOLD;

  const table = await hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: [viewer, ...friends],
    recommendationThreshold: threshold,
    db,
  });

  if (input.entryIds && input.entryIds.length > 0) {
    const validIds = new Set(table.rows.map((r) => r.entryId));
    for (const entryId of input.entryIds) {
      if (!validIds.has(entryId)) {
        throw new DomainError("Alguna de las entradas seleccionadas no pertenece a este festival");
      }
    }
  }

  const seededEntryIds = selectEntriesForJointAgenda(table.rows, {
    strategy: input.strategy,
    minRatingThreshold: threshold,
    ...(input.entryIds !== undefined ? { customEntryIds: input.entryIds } : {}),
  });

  const agendaName =
    input.name?.trim() || `${edition.festival.name} ${edition.year} · Agenda conjunta`;
  const memberIds = [viewer.id, ...friends.map((f) => f.id)];

  const created = await db.jointAgenda.create({
    data: {
      editionId: edition.id,
      comparisonId: linkedComparisonId,
      createdById: viewer.id,
      name: agendaName,
      minRatingThreshold: threshold,
      members: {
        create: memberIds.map((userId) => ({ userId })),
      },
      items: {
        create: seededEntryIds.map((entryId) => ({
          entryId,
          addedById: viewer.id,
          note: "",
        })),
      },
    },
    select: { id: true },
  });

  return getJointAgenda(viewerId, created.id, db);
}

/**
 * Lists all Joint Agendas where `viewerId` is a member and actively follows the edition.
 */
export async function listJointAgendas(
  viewerId: string,
  options: { editionId?: string; db?: PrismaClient } = {},
): Promise<JointAgendaSummaryDTO[]> {
  const db = options.db ?? getDb();

  const [viewer, viewerEditions] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: participantUserSelect,
    }),
    db.userFestivalEdition.findMany({
      where: {
        userId: viewerId,
        ...(options.editionId !== undefined ? { editionId: options.editionId } : {}),
      },
      select: { editionId: true },
    }),
  ]);

  if (!viewer?.isActive || viewerEditions.length === 0) {
    return [];
  }

  const followedEditionIds = viewerEditions.map((e) => e.editionId);

  const rows = await db.jointAgenda.findMany({
    where: {
      editionId: { in: followedEditionIds },
      members: { some: { userId: viewerId } },
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      edition: { select: editionWithBrandSelect },
      members: {
        include: { user: { select: participantUserSelect } },
      },
      _count: { select: { items: true } },
    },
  });

  const resolvedRows = await resolveBatchVisibleMembers(viewer, rows, db);

  return resolvedRows.map(({ row, visibleUsers }) => ({
    id: row.id,
    name: row.name,
    comparisonId: row.comparisonId,
    createdById: row.createdById,
    minRatingThreshold: row.minRatingThreshold,
    edition: toEditionSummaryDTO(row.edition),
    participants: visibleUsers.map(toGroupParticipantDTO),
    itemsCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Retrieves full Joint Agenda detail grouped by festival day, sorted chronologically
 * (including after-midnight festival sets), with schedule conflict detection and live group ratings.
 */
export async function getJointAgenda(
  viewerId: string,
  agendaId: string,
  db: PrismaClient = getDb(),
): Promise<JointAgendaDetailDTO> {
  const parsed = jointAgendaIdSchema.parse({ agendaId });

  const row = await db.jointAgenda.findUnique({
    where: { id: parsed.agendaId },
    include: {
      edition: { select: editionWithBrandSelect },
      members: {
        include: { user: { select: participantUserSelect } },
      },
      items: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!row) {
    throw new DomainError("Agenda conjunta no encontrada");
  }

  const isMember = row.members.some((m) => m.userId === viewerId);
  if (!isMember) {
    throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
  }

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    row.editionId,
    { requireViewerSharesFestivals: false },
    db,
  );

  const visibleUsers = await filterVisibleStoredMembers(
    viewer,
    edition.id,
    row.members.map((m) => m.user),
    db,
  );

  if (viewer.id !== row.createdById && !visibleUsers.some((u) => u.id === row.createdById)) {
    throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
  }

  const table = await hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: visibleUsers,
    recommendationThreshold: row.minRatingThreshold,
    db,
  });

  const organized = organizeJointAgendaEntries({
    comparisonRows: table.rows,
    storedItems: row.items.map((item) => ({
      entryId: item.entryId,
      note: item.note,
      addedById: item.addedById,
      createdAtIso: item.createdAt.toISOString(),
    })),
  });

  return {
    id: row.id,
    name: row.name,
    comparisonId: row.comparisonId,
    createdById: row.createdById,
    isCreator: row.createdById === viewer.id,
    minRatingThreshold: row.minRatingThreshold,
    edition: table.edition,
    participants: table.participants,
    recommendation: table.recommendation,
    items: organized.items,
    days: organized.days,
    conflicts: organized.conflicts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Updates Joint Agenda metadata (`name`, `minRatingThreshold`) or member roster (`friendIds`).
 * Restricted to the agenda creator.
 */
export async function updateJointAgenda(
  viewerId: string,
  rawInput: UpdateJointAgendaInput,
  db: PrismaClient = getDb(),
): Promise<JointAgendaDetailDTO> {
  const input = updateJointAgendaSchema.parse(rawInput);

  const existing = await db.jointAgenda.findUnique({
    where: { id: input.agendaId },
    include: {
      edition: { select: editionWithBrandSelect },
    },
  });

  if (!existing) {
    throw new DomainError("Agenda conjunta no encontrada");
  }
  if (existing.createdById !== viewerId) {
    throw new ForbiddenError(
      "Solo quien creó la agenda conjunta puede modificar sus participantes o ajustes",
    );
  }

  const { viewer } = await resolveViewerAndEdition(
    viewerId,
    existing.editionId,
    { requireViewerSharesFestivals: true },
    db,
  );

  const nextFriends =
    input.friendIds !== undefined
      ? await resolveCoincidingFriendsForViewer(viewerId, existing.editionId, input.friendIds, db)
      : null;

  await db.$transaction(async (tx) => {
    const nextName =
      input.name !== undefined
        ? input.name.trim() ||
          `${existing.edition.festival.name} ${existing.edition.year} · Agenda conjunta`
        : existing.name;

    await tx.jointAgenda.update({
      where: { id: existing.id },
      data: {
        name: nextName,
        ...(input.minRatingThreshold !== undefined
          ? { minRatingThreshold: input.minRatingThreshold }
          : {}),
      },
    });

    if (nextFriends !== null) {
      const desiredIds = new Set([viewer.id, ...nextFriends.map((f) => f.id)]);
      await tx.jointAgendaMember.deleteMany({
        where: {
          agendaId: existing.id,
          userId: { notIn: Array.from(desiredIds) },
        },
      });
      for (const uid of desiredIds) {
        await tx.jointAgendaMember.upsert({
          where: { agendaId_userId: { agendaId: existing.id, userId: uid } },
          create: { agendaId: existing.id, userId: uid },
          update: {},
        });
      }
    }
  });

  return getJointAgenda(viewerId, existing.id, db);
}

/**
 * Adds, removes, toggles, or updates the group note of a `FestivalEntry` inside a Joint Agenda.
 * Any active member of the Joint Agenda who follows the festival can collaborate on entries.
 */
export async function setJointAgendaEntry(
  viewerId: string,
  rawInput: SetJointAgendaEntryInput,
  db: PrismaClient = getDb(),
): Promise<JointAgendaDetailDTO> {
  const input = setJointAgendaEntrySchema.parse(rawInput);

  const [agenda, entry] = await Promise.all([
    db.jointAgenda.findUnique({
      where: { id: input.agendaId },
      include: {
        members: {
          include: { user: { select: participantUserSelect } },
        },
      },
    }),
    db.festivalEntry.findUnique({
      where: { id: input.entryId },
      select: { id: true, editionId: true },
    }),
  ]);

  if (!agenda) {
    throw new DomainError("Agenda conjunta no encontrada");
  }
  if (!agenda.members.some((m) => m.userId === viewerId)) {
    throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
  }
  if (!entry || entry.editionId !== agenda.editionId) {
    throw new DomainError("La actuación seleccionada no pertenece a este festival");
  }

  const { viewer } = await resolveViewerAndEdition(
    viewerId,
    agenda.editionId,
    { requireViewerSharesFestivals: false },
    db,
  );

  if (viewer.id !== agenda.createdById) {
    const visibleUsers = await filterVisibleStoredMembers(
      viewer,
      agenda.editionId,
      agenda.members.map((m) => m.user),
      db,
    );
    if (!visibleUsers.some((u) => u.id === agenda.createdById)) {
      throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
    }
  }

  await db.$transaction(async (tx) => {
    const existingItem = await tx.jointAgendaItem.findUnique({
      where: { agendaId_entryId: { agendaId: agenda.id, entryId: entry.id } },
    });

    const shouldInclude =
      input.included !== undefined
        ? input.included
        : input.note !== undefined
          ? true
          : !existingItem;

    if (!shouldInclude) {
      if (existingItem) {
        await tx.jointAgendaItem.delete({
          where: { agendaId_entryId: { agendaId: agenda.id, entryId: entry.id } },
        });
      }
    } else if (existingItem) {
      if (input.note !== undefined) {
        await tx.jointAgendaItem.update({
          where: { agendaId_entryId: { agendaId: agenda.id, entryId: entry.id } },
          data: { note: input.note },
        });
      }
    } else {
      await tx.jointAgendaItem.create({
        data: {
          agendaId: agenda.id,
          entryId: entry.id,
          addedById: viewerId,
          note: input.note ?? "",
        },
      });
    }

    await tx.jointAgenda.update({
      where: { id: agenda.id },
      data: { updatedAt: new Date() },
    });
  });

  return getJointAgenda(viewerId, agenda.id, db);
}

/**
 * Re-computes Joint Agenda entries from the latest comparative ratings of its visible members.
 */
export async function regenerateJointAgenda(
  viewerId: string,
  rawInput: RegenerateJointAgendaInput,
  db: PrismaClient = getDb(),
): Promise<JointAgendaDetailDTO> {
  const input = regenerateJointAgendaSchema.parse(rawInput);
  if (input.strategy === "CUSTOM") {
    throw new DomainError("Usa una estrategia automática para recalcular la agenda conjunta");
  }

  const row = await db.jointAgenda.findUnique({
    where: { id: input.agendaId },
    include: {
      edition: { select: editionWithBrandSelect },
      members: {
        include: { user: { select: participantUserSelect } },
      },
      items: true,
    },
  });

  if (!row) {
    throw new DomainError("Agenda conjunta no encontrada");
  }
  if (!row.members.some((m) => m.userId === viewerId)) {
    throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
  }

  const { viewer, edition } = await resolveViewerAndEdition(
    viewerId,
    row.editionId,
    { requireViewerSharesFestivals: false },
    db,
  );

  const visibleUsers = await filterVisibleStoredMembers(
    viewer,
    edition.id,
    row.members.map((m) => m.user),
    db,
  );

  if (viewer.id !== row.createdById && !visibleUsers.some((u) => u.id === row.createdById)) {
    throw new ForbiddenError("No tienes acceso a esta agenda conjunta");
  }

  const nextThreshold = input.minRatingThreshold ?? row.minRatingThreshold;

  const table = await hydrateComparisonTable({
    viewer,
    edition,
    participantUsers: visibleUsers,
    recommendationThreshold: nextThreshold,
    db,
  });

  const selectedEntryIds = selectEntriesForJointAgenda(table.rows, {
    strategy: input.strategy,
    minRatingThreshold: nextThreshold,
  });
  const selectedSet = new Set(selectedEntryIds);
  const existingEntrySet = new Set(row.items.map((item) => item.entryId));

  await db.$transaction(async (tx) => {
    if (!input.preserveManualEntries) {
      await tx.jointAgendaItem.deleteMany({
        where: {
          agendaId: row.id,
          entryId: { notIn: Array.from(selectedSet) },
        },
      });
    }

    for (const entryId of selectedSet) {
      if (!existingEntrySet.has(entryId)) {
        await tx.jointAgendaItem.create({
          data: {
            agendaId: row.id,
            entryId,
            addedById: viewer.id,
            note: "",
          },
        });
      }
    }

    await tx.jointAgenda.update({
      where: { id: row.id },
      data: {
        minRatingThreshold: nextThreshold,
        updatedAt: new Date(),
      },
    });
  });

  return getJointAgenda(viewerId, row.id, db);
}

/**
 * Allows a non-creator participant to leave a Joint Agenda.
 */
export async function leaveJointAgenda(
  viewerId: string,
  rawInput: JointAgendaIdInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = jointAgendaIdSchema.parse(rawInput);

  const existing = await db.jointAgenda.findUnique({
    where: { id: input.agendaId },
    include: { members: { select: { userId: true } } },
  });

  if (!existing) {
    throw new DomainError("Agenda conjunta no encontrada");
  }
  if (existing.createdById === viewerId) {
    throw new DomainError(
      "Como creador de la agenda conjunta, elimínala si ya no quieres mantenerla",
    );
  }
  if (!existing.members.some((m) => m.userId === viewerId)) {
    throw new ForbiddenError("No perteneces a esta agenda conjunta");
  }

  await db.jointAgendaMember.delete({
    where: { agendaId_userId: { agendaId: existing.id, userId: viewerId } },
  });
}

/**
 * Deletes a Joint Agenda. Restricted to the agenda creator.
 */
export async function deleteJointAgenda(
  viewerId: string,
  rawInput: JointAgendaIdInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = jointAgendaIdSchema.parse(rawInput);

  const existing = await db.jointAgenda.findUnique({
    where: { id: input.agendaId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new DomainError("Agenda conjunta no encontrada");
  }
  if (existing.createdById !== viewerId) {
    throw new ForbiddenError("Solo quien creó la agenda conjunta puede eliminarla");
  }

  await db.jointAgenda.delete({ where: { id: existing.id } });
}
