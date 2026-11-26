import { slugifyFestival } from "@/domain/artist-matching";
import {
  type CreateFestivalInput,
  createFestivalSchema,
  type UpdateFestivalInput,
  updateFestivalSchema,
} from "@/domain/schemas";
import type { Festival, PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export async function listFestivals(db: PrismaClient = getDb()): Promise<Festival[]> {
  return db.festival.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }, { name: "asc" }],
  });
}

export async function listFestivalsWithCounts(db: PrismaClient = getDb()) {
  return db.festival.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: { entries: true },
      },
    },
  });
}

export async function getFestivalBySlug(
  slug: string,
  db: PrismaClient = getDb(),
): Promise<Festival | null> {
  return db.festival.findUnique({ where: { slug } });
}

export async function getDefaultFestival(db: PrismaClient = getDb()): Promise<Festival | null> {
  return db.festival.findFirst({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
}

export async function createFestival(
  rawInput: CreateFestivalInput,
  db: PrismaClient = getDb(),
): Promise<Festival> {
  const input = createFestivalSchema.parse(rawInput);
  const baseSlug = slugifyFestival(input.name, input.year);

  let slug = baseSlug;
  let suffix = 2;
  while (await db.festival.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return db.festival.create({
    data: {
      slug,
      name: input.name,
      year: input.year,
      location: input.location || null,
      locationProvince: input.locationProvince ?? null,
      locationRegion: input.locationRegion ?? null,
      locationCountry: input.locationCountry ?? null,
      locationCountryCode: input.locationCountryCode ?? null,
      locationLatitude: input.locationLatitude ?? null,
      locationLongitude: input.locationLongitude ?? null,
      locationPlaceId: input.locationPlaceId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    },
  });
}

export async function updateFestival(
  rawInput: UpdateFestivalInput,
  db: PrismaClient = getDb(),
): Promise<Festival> {
  const input = updateFestivalSchema.parse(rawInput);

  return db.festival.update({
    where: { id: input.festivalId },
    data: {
      name: input.name,
      year: input.year,
      location: input.location || null,
      locationProvince: input.locationProvince ?? null,
      locationRegion: input.locationRegion ?? null,
      locationCountry: input.locationCountry ?? null,
      locationCountryCode: input.locationCountryCode ?? null,
      locationLatitude: input.locationLatitude ?? null,
      locationLongitude: input.locationLongitude ?? null,
      locationPlaceId: input.locationPlaceId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    },
  });
}

export async function listHomeArtists(db: PrismaClient = getDb()) {
  const [queueRaw, ratedRaw] = await Promise.all([
    db.artist.findMany({
      where: {
        status: { in: ["LISTENING", "PENDING"] },
        entries: { some: {} },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 8,
      include: {
        entries: {
          take: 1,
          orderBy: { entry: { festival: { year: "desc" } } },
          include: {
            entry: {
              include: { festival: true },
            },
          },
        },
      },
    }),
    db.artist.findMany({
      where: {
        rating: { not: null },
        status: { not: "DISCARDED" },
        entries: { some: {} },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
      include: {
        entries: {
          take: 1,
          orderBy: { entry: { festival: { year: "desc" } } },
          include: {
            entry: {
              include: { festival: true },
            },
          },
        },
      },
    }),
  ]);

  const sortedQueue = [...queueRaw].sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "LISTENING" ? -1 : 1;
  });

  return {
    queue: sortedQueue.slice(0, 6),
    recentlyRated: ratedRaw.slice(0, 6),
  };
}
