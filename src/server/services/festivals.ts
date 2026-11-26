import { slugifyFestival } from "@/domain/artist-matching";
import { type CreateFestivalInput, createFestivalSchema } from "@/domain/schemas";
import type { Festival, PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export async function listFestivals(db: PrismaClient = getDb()): Promise<Festival[]> {
  return db.festival.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }, { name: "asc" }],
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
