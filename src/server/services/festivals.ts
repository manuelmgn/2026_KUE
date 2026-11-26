import {
  normalizeFestivalName,
  slugifyFestival,
  slugifyFestivalBrand,
} from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import {
  type CreateFestivalEditionInput,
  type CreateFestivalInput,
  createFestivalEditionSchema,
  createFestivalSchema,
  type UpdateFestivalInput,
  updateFestivalSchema,
} from "@/domain/schemas";
import type { Festival, FestivalEdition, PrismaClient } from "@/generated/prisma/client";
import { validateLineupSourceUrl } from "@/server/clients/lineup-source";
import { getDb } from "@/server/db";
import {
  notifyFestivalMetadataUpdated,
  notifyFriendsJoinedFestival,
} from "@/server/services/notifications";

export interface EditionWithFestival extends FestivalEdition {
  festival: Pick<Festival, "id" | "slug" | "name">;
}

export interface EditionWithFestivalAndCount extends EditionWithFestival {
  _count: { entries: number };
}

export async function listUserEditions(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestival[]> {
  return db.festivalEdition.findMany({
    where: {
      followers: { some: { userId } },
    },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }, { festival: { name: "asc" } }],
  });
}

export async function listUserEditionsWithCounts(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestivalAndCount[]> {
  return db.festivalEdition.findMany({
    where: {
      followers: { some: { userId } },
    },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
      _count: { select: { entries: true } },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }, { festival: { name: "asc" } }],
  });
}

export async function listAllCatalogFestivals(userId: string, db: PrismaClient = getDb()) {
  const [festivals, userMemberships] = await Promise.all([
    db.festival.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        editions: {
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
          include: {
            _count: { select: { entries: true, followers: true } },
          },
        },
      },
    }),
    db.userFestivalEdition.findMany({
      where: { userId },
      select: { editionId: true },
    }),
  ]);

  const addedSet = new Set(userMemberships.map((m) => m.editionId));
  return festivals.map((fest) => ({
    ...fest,
    editions: fest.editions.map((ed) => ({
      ...ed,
      isAdded: addedSet.has(ed.id),
    })),
  }));
}

export async function getEditionBySlug(
  slug: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestival | null> {
  return db.festivalEdition.findUnique({
    where: { slug },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
    },
  });
}

export async function getEditionByBrandAndYear(
  brandSlug: string,
  year: number,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestivalAndCount | null> {
  if (!Number.isInteger(year) || year < 1950 || year > 2100) {
    return null;
  }
  return db.festivalEdition.findFirst({
    where: {
      year,
      festival: { slug: brandSlug },
    },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
      _count: { select: { entries: true } },
    },
  });
}

export async function getEditionWithSiblingYears(
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<number[]> {
  const edition = await db.festivalEdition.findUnique({
    where: { id: editionId },
    select: { festivalId: true },
  });
  if (!edition) return [];
  const siblings = await db.festivalEdition.findMany({
    where: { festivalId: edition.festivalId },
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return siblings.map((s) => s.year);
}

export async function isEditionInUserFestivals(
  userId: string,
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<boolean> {
  const row = await db.userFestivalEdition.findUnique({
    where: { userId_editionId: { userId, editionId } },
    select: { editionId: true },
  });
  return row !== null;
}

export async function addEditionToUserFestivals(
  userId: string,
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestivalAndCount> {
  const [edition, alreadyAdded] = await Promise.all([
    db.festivalEdition.findUnique({
      where: { id: editionId },
      include: {
        festival: { select: { id: true, slug: true, name: true } },
        _count: { select: { entries: true } },
      },
    }),
    db.userFestivalEdition.findUnique({
      where: { userId_editionId: { userId, editionId } },
      select: { editionId: true },
    }),
  ]);
  if (!edition) {
    throw new DomainError("Edición de festival no encontrada");
  }

  await db.userFestivalEdition.upsert({
    where: { userId_editionId: { userId, editionId } },
    create: { userId, editionId },
    update: {},
  });

  if (!alreadyAdded) {
    await notifyFriendsJoinedFestival(userId, editionId, db);
  }

  return edition;
}

export async function removeEditionFromUserFestivals(
  userId: string,
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<void> {
  await db.userFestivalEdition.deleteMany({
    where: { userId, editionId },
  });
}

async function generateUniqueBrandSlug(name: string, db: PrismaClient): Promise<string> {
  const base = slugifyFestivalBrand(name);
  let slug = base;
  let suffix = 2;
  while (await db.festival.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function generateUniqueEditionSlug(
  name: string,
  year: number,
  db: PrismaClient,
): Promise<string> {
  const base = slugifyFestival(name, year);
  let slug = base;
  let suffix = 2;
  while (await db.festivalEdition.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

/**
 * Creates a new Festival (or reuses an existing parent Festival with the same normalizedName)
 * along with its requested annual edition, and automatically adds the edition to the creator's
 * "Mis festivales".
 */
export async function createFestival(
  rawInput: CreateFestivalInput,
  userId: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestival> {
  const input = createFestivalSchema.parse(rawInput);

  const cleanedSourceUrl = input.lineupSourceUrl?.trim() || null;
  if (cleanedSourceUrl) {
    validateLineupSourceUrl(cleanedSourceUrl);
  }

  const normalizedName = normalizeFestivalName(input.name);
  let brand = await db.festival.findUnique({ where: { normalizedName } });

  if (!brand) {
    const brandSlug = await generateUniqueBrandSlug(input.name, db);
    brand = await db.festival.create({
      data: {
        slug: brandSlug,
        name: input.name,
        normalizedName,
        location: input.location || null,
        locationProvince: input.locationProvince ?? null,
        locationRegion: input.locationRegion ?? null,
        locationCountry: input.locationCountry ?? null,
        locationCountryCode: input.locationCountryCode ?? null,
        locationLatitude: input.locationLatitude ?? null,
        locationLongitude: input.locationLongitude ?? null,
        locationPlaceId: input.locationPlaceId ?? null,
        createdById: userId,
      },
    });
  }

  const existingEdition = await db.festivalEdition.findUnique({
    where: { festivalId_year: { festivalId: brand.id, year: input.year } },
  });
  if (existingEdition) {
    throw new DomainError(
      `Ya existe la edición ${brand.name} ${input.year} en el catálogo. Puedes añadirla a tus festivales.`,
    );
  }

  const editionSlug = await generateUniqueEditionSlug(brand.name, input.year, db);

  const edition = await db.festivalEdition.create({
    data: {
      festivalId: brand.id,
      slug: editionSlug,
      year: input.year,
      location: input.location || brand.location || null,
      locationProvince: input.locationProvince ?? brand.locationProvince ?? null,
      locationRegion: input.locationRegion ?? brand.locationRegion ?? null,
      locationCountry: input.locationCountry ?? brand.locationCountry ?? null,
      locationCountryCode: input.locationCountryCode ?? brand.locationCountryCode ?? null,
      locationLatitude: input.locationLatitude ?? brand.locationLatitude ?? null,
      locationLongitude: input.locationLongitude ?? brand.locationLongitude ?? null,
      locationPlaceId: input.locationPlaceId ?? brand.locationPlaceId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      lineupSourceUrl: cleanedSourceUrl,
      autoSyncEnabled: cleanedSourceUrl ? (input.autoSyncEnabled ?? false) : false,
      syncIntervalHours: input.syncIntervalHours ?? 24,
      createdById: userId,
      followers: {
        create: { userId },
      },
    },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
    },
  });

  return edition;
}

/**
 * Adds a new annual edition to an existing parent Festival brand, inheriting its default
 * location unless overridden, and adds it to the creator's "Mis festivales".
 */
export async function createFestivalEdition(
  rawInput: CreateFestivalEditionInput,
  userId: string,
  db: PrismaClient = getDb(),
): Promise<EditionWithFestival> {
  const input = createFestivalEditionSchema.parse(rawInput);

  const brand = await db.festival.findUnique({ where: { id: input.festivalId } });
  if (!brand) {
    throw new DomainError("Festival no encontrado");
  }

  const existingEdition = await db.festivalEdition.findUnique({
    where: { festivalId_year: { festivalId: brand.id, year: input.year } },
  });
  if (existingEdition) {
    throw new DomainError(`La edición ${brand.name} ${input.year} ya existe en el catálogo`);
  }

  const cleanedSourceUrl = input.lineupSourceUrl?.trim() || null;
  if (cleanedSourceUrl) {
    validateLineupSourceUrl(cleanedSourceUrl);
  }

  const hasCustomLocation = Boolean(input.location?.trim());
  const editionSlug = await generateUniqueEditionSlug(brand.name, input.year, db);

  return db.festivalEdition.create({
    data: {
      festivalId: brand.id,
      slug: editionSlug,
      year: input.year,
      location: hasCustomLocation ? (input.location ?? null) : brand.location,
      locationProvince: hasCustomLocation
        ? (input.locationProvince ?? null)
        : brand.locationProvince,
      locationRegion: hasCustomLocation ? (input.locationRegion ?? null) : brand.locationRegion,
      locationCountry: hasCustomLocation ? (input.locationCountry ?? null) : brand.locationCountry,
      locationCountryCode: hasCustomLocation
        ? (input.locationCountryCode ?? null)
        : brand.locationCountryCode,
      locationLatitude: hasCustomLocation
        ? (input.locationLatitude ?? null)
        : brand.locationLatitude,
      locationLongitude: hasCustomLocation
        ? (input.locationLongitude ?? null)
        : brand.locationLongitude,
      locationPlaceId: hasCustomLocation ? (input.locationPlaceId ?? null) : brand.locationPlaceId,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      lineupSourceUrl: cleanedSourceUrl,
      autoSyncEnabled: cleanedSourceUrl ? (input.autoSyncEnabled ?? false) : false,
      syncIntervalHours: input.syncIntervalHours ?? 24,
      createdById: userId,
      followers: {
        create: { userId },
      },
    },
    include: {
      festival: { select: { id: true, slug: true, name: true } },
    },
  });
}

export async function updateFestival(
  rawInput: UpdateFestivalInput,
  db: PrismaClient = getDb(),
  options: { actorUserId?: string | null } = {},
): Promise<EditionWithFestival> {
  const input = updateFestivalSchema.parse(rawInput);

  const existing = await db.festivalEdition.findUnique({
    where: { id: input.festivalId },
    include: { festival: true },
  });
  if (!existing) {
    throw new DomainError("Edición de festival no encontrada");
  }

  // Check year conflict within the same festival brand
  if (existing.year !== input.year) {
    const conflict = await db.festivalEdition.findUnique({
      where: { festivalId_year: { festivalId: existing.festivalId, year: input.year } },
      select: { id: true },
    });
    if (conflict) {
      throw new DomainError(`Ya existe otra edición para el año ${input.year}`);
    }
  }

  // Update brand name if changed (ensuring no duplicate normalizedName)
  const nextNormalizedName = normalizeFestivalName(input.name);
  if (nextNormalizedName !== existing.festival.normalizedName) {
    const nameConflict = await db.festival.findUnique({
      where: { normalizedName: nextNormalizedName },
      select: { id: true },
    });
    if (nameConflict && nameConflict.id !== existing.festivalId) {
      throw new DomainError(`Ya existe otro festival llamado «${input.name}»`);
    }
  }

  const nextLocation = input.location || null;
  const nextStart = input.startDate ?? null;
  const nextEnd = input.endDate ?? null;

  const metadataChanged =
    existing.location !== nextLocation ||
    (existing.startDate?.toISOString() ?? null) !== (nextStart?.toISOString() ?? null) ||
    (existing.endDate?.toISOString() ?? null) !== (nextEnd?.toISOString() ?? null);

  const updated = await db.$transaction(async (tx) => {
    await tx.festival.update({
      where: { id: existing.festivalId },
      data: {
        name: input.name,
        normalizedName: nextNormalizedName,
      },
    });

    return tx.festivalEdition.update({
      where: { id: input.festivalId },
      data: {
        year: input.year,
        location: nextLocation,
        locationProvince: input.locationProvince ?? null,
        locationRegion: input.locationRegion ?? null,
        locationCountry: input.locationCountry ?? null,
        locationCountryCode: input.locationCountryCode ?? null,
        locationLatitude: input.locationLatitude ?? null,
        locationLongitude: input.locationLongitude ?? null,
        locationPlaceId: input.locationPlaceId ?? null,
        startDate: nextStart,
        endDate: nextEnd,
      },
      include: {
        festival: { select: { id: true, slug: true, name: true } },
      },
    });
  });

  if (metadataChanged) {
    await notifyFestivalMetadataUpdated(updated.id, {
      excludeUserId: options.actorUserId ?? null,
      db,
    });
  }

  return updated;
}

export async function deleteFestivalEdition(
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<void> {
  const edition = await db.festivalEdition.findUnique({
    where: { id: editionId },
    select: { id: true, festivalId: true },
  });
  if (!edition) {
    throw new DomainError("Edición de festival no encontrada");
  }

  await db.festivalEdition.delete({ where: { id: editionId } });

  // Clean up parent brand if it has no remaining editions
  const remaining = await db.festivalEdition.count({ where: { festivalId: edition.festivalId } });
  if (remaining === 0) {
    await db.festival.delete({ where: { id: edition.festivalId } }).catch(() => undefined);
  }
}

export async function deleteFestivalBrand(
  festivalId: string,
  db: PrismaClient = getDb(),
): Promise<void> {
  const existing = await db.festival.findUnique({
    where: { id: festivalId },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError("Festival no encontrado");
  }
  await db.festival.delete({ where: { id: festivalId } });
}

export async function listHomeArtists(userId: string, db: PrismaClient = getDb()) {
  // Fetch artists appearing in this user's followed editions along with this user's states
  const myEditions = await db.userFestivalEdition.findMany({
    where: { userId },
    select: { editionId: true },
  });
  const editionIds = myEditions.map((m) => m.editionId);
  if (editionIds.length === 0) {
    return { queue: [], recentlyRated: [] };
  }

  const artists = await db.artist.findMany({
    where: {
      entries: {
        some: {
          entry: {
            editionId: { in: editionIds },
          },
        },
      },
    },
    include: {
      userStates: {
        where: { userId },
        take: 1,
      },
      entries: {
        where: {
          entry: { editionId: { in: editionIds } },
        },
        take: 1,
        orderBy: { entry: { edition: { year: "desc" } } },
        include: {
          entry: {
            include: {
              edition: {
                include: {
                  festival: { select: { slug: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const hydrated = artists.map((artist) => {
    const state = artist.userStates[0];
    return {
      id: artist.id,
      name: artist.name,
      imagePath: artist.imagePath,
      rating: state?.rating ?? null,
      status: state?.status ?? ("PENDING" as const),
      notes: state?.notes ?? "",
      stateUpdatedAt: state?.updatedAt ?? artist.updatedAt,
      edition: artist.entries[0]?.entry.edition ?? null,
    };
  });

  const queue = hydrated
    .filter((a) => a.status === "LISTENING" || a.status === "PENDING")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "LISTENING" ? -1 : 1;
      }
      return b.stateUpdatedAt.getTime() - a.stateUpdatedAt.getTime();
    })
    .slice(0, 6);

  const recentlyRated = hydrated
    .filter((a) => a.rating !== null && a.status !== "DISCARDED")
    .sort((a, b) => b.stateUpdatedAt.getTime() - a.stateUpdatedAt.getTime())
    .slice(0, 6);

  return { queue, recentlyRated };
}

export async function listEditionHomeArtists(
  userId: string,
  editionId: string,
  db: PrismaClient = getDb(),
) {
  const artists = await db.artist.findMany({
    where: {
      entries: {
        some: {
          entry: { editionId },
        },
      },
    },
    include: {
      userStates: {
        where: { userId },
        take: 1,
      },
      entries: {
        where: { entry: { editionId } },
        take: 1,
        include: {
          entry: {
            include: {
              edition: {
                include: {
                  festival: { select: { slug: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const hydrated = artists.map((artist) => {
    const state = artist.userStates[0];
    return {
      id: artist.id,
      name: artist.name,
      imagePath: artist.imagePath,
      rating: state?.rating ?? null,
      status: state?.status ?? ("PENDING" as const),
      notes: state?.notes ?? "",
      stateUpdatedAt: state?.updatedAt ?? artist.updatedAt,
      edition: artist.entries[0]?.entry.edition ?? null,
    };
  });

  const queue = hydrated
    .filter((a) => a.status === "LISTENING" || a.status === "PENDING")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "LISTENING" ? -1 : 1;
      }
      return b.stateUpdatedAt.getTime() - a.stateUpdatedAt.getTime();
    })
    .slice(0, 6);

  const recentlyRated = hydrated
    .filter((a) => a.rating !== null && a.status !== "DISCARDED")
    .sort((a, b) => b.stateUpdatedAt.getTime() - a.stateUpdatedAt.getTime())
    .slice(0, 6);

  return { queue, recentlyRated };
}
