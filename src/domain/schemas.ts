import { z } from "zod";

export const ARTIST_STATUSES = ["PENDING", "LISTENING", "RATED", "DISCARDED"] as const;
export const SYNC_STATUSES = ["PENDING", "SYNCING", "SYNCED", "FAILED"] as const;
export const RELEASE_TYPES = ["ALBUM", "EP", "LIVE", "OTHER"] as const;
export const LINEUP_SYNC_MODES = ["REVIEW", "AUTO"] as const;

export const artistStatusSchema = z.enum(ARTIST_STATUSES);
export type ArtistStatus = z.infer<typeof artistStatusSchema>;

export const syncStatusSchema = z.enum(SYNC_STATUSES);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const releaseTypeSchema = z.enum(RELEASE_TYPES);
export type ReleaseType = z.infer<typeof releaseTypeSchema>;

export const lineupSyncModeSchema = z.enum(LINEUP_SYNC_MODES);
export type LineupSyncMode = z.infer<typeof lineupSyncModeSchema>;

export const ratingSchema = z.number().int().min(1).max(5);
export const nullableRatingSchema = ratingSchema.nullable();

export const statusFilterSchema = z.enum(["ALL", ...ARTIST_STATUSES]);
export type StatusFilter = z.infer<typeof statusFilterSchema>;

export const ratingFilterSchema = z.enum(["ALL", "MUST", "5", "4", "3", "LOW", "UNRATED"]);
export type RatingFilter = z.infer<typeof ratingFilterSchema>;

export const viewModeSchema = z.enum(["grid", "index"]);
export type ViewMode = z.infer<typeof viewModeSchema>;

export const createFestivalSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre del festival es obligatorio").max(120),
    year: z.coerce
      .number({ error: "El año debe ser un número" })
      .int("El año debe ser un número entero")
      .min(1950, "El año debe estar entre 1950 y 2100")
      .max(2100, "El año debe estar entre 1950 y 2100"),
    location: z.string().trim().max(120).optional(),
    locationProvince: z.string().trim().max(120).nullable().optional(),
    locationRegion: z.string().trim().max(120).nullable().optional(),
    locationCountry: z.string().trim().max(120).nullable().optional(),
    locationCountryCode: z.string().trim().max(10).nullable().optional(),
    locationLatitude: z.number().min(-90).max(90).nullable().optional(),
    locationLongitude: z.number().min(-180).max(180).nullable().optional(),
    locationPlaceId: z.string().trim().max(64).nullable().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    error: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });
export type CreateFestivalInput = z.infer<typeof createFestivalSchema>;

export const updateFestivalSchema = z
  .object({
    festivalId: z.string().min(1),
    name: z.string().trim().min(1, "El nombre del festival es obligatorio").max(120),
    year: z.coerce
      .number({ error: "El año debe ser un número" })
      .int("El año debe ser un número entero")
      .min(1950, "El año debe estar entre 1950 y 2100")
      .max(2100, "El año debe estar entre 1950 y 2100"),
    location: z.string().trim().max(120).nullable().optional(),
    locationProvince: z.string().trim().max(120).nullable().optional(),
    locationRegion: z.string().trim().max(120).nullable().optional(),
    locationCountry: z.string().trim().max(120).nullable().optional(),
    locationCountryCode: z.string().trim().max(10).nullable().optional(),
    locationLatitude: z.number().min(-90).max(90).nullable().optional(),
    locationLongitude: z.number().min(-180).max(180).nullable().optional(),
    locationPlaceId: z.string().trim().max(64).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    error: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });
export type UpdateFestivalInput = z.infer<typeof updateFestivalSchema>;

export const updateFestivalSyncConfigSchema = z.object({
  festivalId: z.string().min(1),
  lineupSourceUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .refine(
      (value) => !value || (URL.canParse(value) && /^https?:\/\//i.test(value)),
      "Debe ser una URL válida (http:// o https://)",
    ),
  autoSyncEnabled: z.boolean().default(false),
  autoSyncMode: lineupSyncModeSchema.default("REVIEW"),
  syncIntervalHours: z.coerce.number().int().min(1).max(168).default(24),
});
export type UpdateFestivalSyncConfigInput = z.infer<typeof updateFestivalSyncConfigSchema>;

export const applyLineupDiffSchema = z.object({
  festivalId: z.string().min(1),
  addedIndexes: z.array(z.number().int().min(0)).optional(),
  updatedEntryIds: z.array(z.string().min(1)).optional(),
});
export type ApplyLineupDiffInput = z.infer<typeof applyLineupDiffSchema>;

export const deleteEntrySchema = z.object({
  entryId: z.string().min(1),
});
export type DeleteEntryInput = z.infer<typeof deleteEntrySchema>;

export const updateArtistRatingSchema = z.object({
  artistId: z.string().min(1),
  rating: nullableRatingSchema,
});
export type UpdateArtistRatingInput = z.infer<typeof updateArtistRatingSchema>;

export const updateArtistStatusSchema = z.object({
  artistId: z.string().min(1),
  status: artistStatusSchema,
});
export type UpdateArtistStatusInput = z.infer<typeof updateArtistStatusSchema>;

export const updateArtistNotesSchema = z.object({
  artistId: z.string().min(1),
  notes: z.string().max(10_000),
});
export type UpdateArtistNotesInput = z.infer<typeof updateArtistNotesSchema>;

export const disambiguateArtistSchema = z.object({
  artistId: z.string().min(1),
  mbid: z.guid({ error: "MBID inválido" }),
  country: z.string().trim().max(10).nullable().optional(),
});
export type DisambiguateArtistInput = z.infer<typeof disambiguateArtistSchema>;

export const updateAlbumPinSchema = z.object({
  albumId: z.string().min(1),
  isPinned: z.boolean(),
});
export type UpdateAlbumPinInput = z.infer<typeof updateAlbumPinSchema>;

export const customUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (URL.canParse(value) && /^https?:\/\//i.test(value)),
    "Debe ser una URL válida (http:// o https://)",
  );

export const updateAlbumCustomUrlSchema = z.object({
  albumId: z.string().min(1),
  customUrl: customUrlSchema.nullable(),
});
export type UpdateAlbumCustomUrlInput = z.infer<typeof updateAlbumCustomUrlSchema>;

export const updateEntryScheduleSchema = z.object({
  entryId: z.string().min(1),
  day: z.string().trim().max(60).nullable().optional(),
  stage: z.string().trim().max(100).nullable().optional(),
  setTime: z.string().trim().max(20).nullable().optional(),
  liveRating: nullableRatingSchema.optional(),
  liveNotes: z.string().max(4_000).optional(),
});
export type UpdateEntryScheduleInput = z.infer<typeof updateEntryScheduleSchema>;

export const importRowSchema = z.object({
  billingName: z.string().trim().min(1, "El nombre en cartel es obligatorio").max(240),
  artistNames: z.array(z.string().trim().min(1).max(160)).min(1),
  subtitle: z.string().trim().max(240).nullable(),
  day: z.string().trim().max(60).nullable(),
  stage: z.string().trim().max(100).nullable(),
  setTime: z.string().trim().max(20).nullable(),
  included: z.boolean().default(true),
});
export type ImportRowInput = z.infer<typeof importRowSchema>;

export const MAX_IMPORT_ROWS = 2_000;

export const importLineupSchema = z.object({
  festivalId: z.string().min(1, "Selecciona un festival"),
  rows: z
    .array(importRowSchema)
    .min(1, "No hay filas para importar")
    .max(MAX_IMPORT_ROWS, `Máximo ${MAX_IMPORT_ROWS} filas por importación`),
});
export type ImportLineupInput = z.infer<typeof importLineupSchema>;

// External API response schemas (strictly NO MusicBrainz tags/genres)

export const musicBrainzArtistCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().optional(),
  type: z.string().optional(),
  disambiguation: z.string().optional(),
  score: z.number().optional(),
});
export type MusicBrainzArtistCandidate = z.infer<typeof musicBrainzArtistCandidateSchema>;

export const musicBrainzArtistSearchResponseSchema = z.object({
  artists: z.array(musicBrainzArtistCandidateSchema).default([]),
});

export const musicBrainzReleaseGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  "primary-type": z.string().nullable().optional(),
  "secondary-types": z.array(z.string()).optional(),
  "first-release-date": z.string().optional(),
});
export type MusicBrainzReleaseGroup = z.infer<typeof musicBrainzReleaseGroupSchema>;

export const musicBrainzReleaseGroupResponseSchema = z.object({
  "release-groups": z.array(musicBrainzReleaseGroupSchema).default([]),
});

export const deezerArtistItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  picture_xl: z.string().optional(),
  picture_big: z.string().optional(),
  picture_medium: z.string().optional(),
});

export const deezerArtistSearchResponseSchema = z.object({
  data: z.array(deezerArtistItemSchema).default([]),
});

export const deezerAlbumItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  cover_xl: z.string().optional(),
  cover_big: z.string().optional(),
  cover_medium: z.string().optional(),
  artist: z
    .object({
      id: z.number().optional(),
      name: z.string(),
    })
    .optional(),
});

export const deezerAlbumSearchResponseSchema = z.object({
  data: z.array(deezerAlbumItemSchema).default([]),
});

export const wikipediaOpenSearchResponseSchema = z.tuple([
  z.string(),
  z.array(z.string()),
  z.array(z.string()),
  z.array(z.string()),
]);

export const wikipediaSummaryResponseSchema = z.object({
  title: z.string().optional(),
  type: z.string().optional(),
  extract: z.string().optional(),
});

export const openMeteoGeocodingItemSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  country_code: z.string().optional(),
  country: z.string().optional(),
  admin1: z.string().optional(),
  admin2: z.string().optional(),
});

export const openMeteoGeocodingResponseSchema = z.object({
  results: z.array(openMeteoGeocodingItemSchema).default([]),
});

export const placeCandidateSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  province: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;
