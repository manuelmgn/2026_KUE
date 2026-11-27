import { z } from "zod";

export const USER_ROLES = ["USER", "ADMIN"] as const;
export const ARTIST_STATUSES = ["PENDING", "LISTENING", "RATED", "DISCARDED"] as const;
export const SYNC_STATUSES = ["PENDING", "SYNCING", "SYNCED", "FAILED"] as const;
export const RELEASE_TYPES = ["ALBUM", "EP", "LIVE", "OTHER"] as const;
export const LINEUP_SYNC_MODES = ["REVIEW", "AUTO"] as const;
export const VISIBILITY_SCOPES = ["FRIENDS", "PRIVATE"] as const;
export const FRIENDSHIP_STATUSES = ["PENDING", "ACCEPTED"] as const;
export const NOTIFICATION_TYPES = [
  "FRIEND_REQUEST_RECEIVED",
  "FRIEND_REQUEST_ACCEPTED",
  "FESTIVAL_LINEUP_UPDATED",
  "FESTIVAL_METADATA_UPDATED",
  "FRIEND_JOINED_FESTIVAL",
] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const visibilityScopeSchema = z.enum(VISIBILITY_SCOPES);
export type VisibilityScope = z.infer<typeof visibilityScopeSchema>;

export const friendshipStatusSchema = z.enum(FRIENDSHIP_STATUSES);
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>;

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

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

// Auth & User Management schemas

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
  .max(32, "El nombre de usuario no puede superar los 32 caracteres")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "El nombre de usuario solo puede incluir letras, números, puntos, guiones y guion bajo",
  );

export const emailSchema = z
  .email("Introduce un correo electrónico válido")
  .trim()
  .max(160, "El correo electrónico es demasiado largo");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña no puede superar los 128 caracteres");

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Introduce tu nombre de usuario").max(160),
  password: z.string().min(1, "Introduce tu contraseña").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  inviteToken: z.string().trim().min(1).max(128).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const INVITATION_DURATIONS = ["5h", "24h", "72h", "7d", "30d"] as const;
export const invitationDurationSchema = z.enum(INVITATION_DURATIONS);
export type InvitationDuration = z.infer<typeof invitationDurationSchema>;
export const INVITATION_DEFAULT_DURATION: InvitationDuration = "7d";

export const INVITATION_MIN_USES = 1;
export const INVITATION_MAX_USES = 5;
export const INVITATION_DEFAULT_MAX_USES = 2;

export const INVITATION_DURATION_MS: Record<InvitationDuration, number> = {
  "5h": 5 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "72h": 72 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const createInvitationSchema = z.object({
  maxUses: z.coerce
    .number({ error: "El número de usos debe ser un entero" })
    .int("El número de usos debe ser un entero")
    .min(INVITATION_MIN_USES, "El mínimo es 1 uso")
    .max(INVITATION_MAX_USES, "El máximo son 5 usos")
    .default(INVITATION_DEFAULT_MAX_USES),
  duration: invitationDurationSchema.default(INVITATION_DEFAULT_DURATION),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const revokeInvitationSchema = z.object({
  invitationId: z.string().trim().min(1),
});
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Introduce tu contraseña actual").max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adminCreateUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: userRoleSchema.default("USER"),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: userRoleSchema,
});
export type AdminUpdateUserRoleInput = z.infer<typeof adminUpdateUserRoleSchema>;

export const adminUpdateUserActiveSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});
export type AdminUpdateUserActiveInput = z.infer<typeof adminUpdateUserActiveSchema>;

export const adminResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: passwordSchema,
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

export const adminDeleteUserSchema = z.object({
  userId: z.string().min(1),
});
export type AdminDeleteUserInput = z.infer<typeof adminDeleteUserSchema>;

// Profile, Privacy, Friends & Notifications schemas

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(50, "El nombre visible no puede superar los 50 caracteres")
    .nullable()
    .optional(),
  bio: z.string().trim().max(240, "La biografía no puede superar los 240 caracteres").optional(),
  location: z
    .string()
    .trim()
    .max(80, "La ubicación no puede superar los 80 caracteres")
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updatePrivacySchema = z.object({
  festivalsVisibility: visibilityScopeSchema.optional(),
  ratingsVisibility: visibilityScopeSchema.optional(),
  notesVisibility: visibilityScopeSchema.optional(),
});
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;

export const friendTargetSchema = z.object({
  targetUserId: z.string().trim().min(1, "Usuario no válido"),
});
export type FriendTargetInput = z.infer<typeof friendTargetSchema>;

export const userSearchQuerySchema = z.string().trim().max(64, "Búsqueda demasiado larga");

export const notificationIdSchema = z.object({
  notificationId: z.string().trim().min(1),
});
export type NotificationIdInput = z.infer<typeof notificationIdSchema>;

export const notificationPayloadSchema = z.object({
  actorUsername: z.string().optional(),
  actorDisplayName: z.string().nullable().optional(),
  festivalName: z.string().optional(),
  festivalYear: z.number().int().optional(),
  festivalSlug: z.string().optional(),
  addedCount: z.number().int().min(0).optional(),
  updatedCount: z.number().int().min(0).optional(),
  friendshipId: z.string().optional(),
});
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

// Group Comparison & Joint Agenda schemas

export const COMPARISON_SORT_MODES = [
  "LINEUP",
  "AVG_DESC",
  "AVG_ASC",
  "DISAGREEMENT_DESC",
  "MUST_SEE_DESC",
] as const;
export const comparisonSortModeSchema = z.enum(COMPARISON_SORT_MODES);
export type ComparisonSortMode = z.infer<typeof comparisonSortModeSchema>;

export const JOINT_AGENDA_STRATEGIES = [
  "RECOMMENDED",
  "MUST_SEE",
  "SHARED_FAVORITES",
  "CUSTOM",
  "EMPTY",
] as const;
export const jointAgendaStrategySchema = z.enum(JOINT_AGENDA_STRATEGIES);
export type JointAgendaStrategy = z.infer<typeof jointAgendaStrategySchema>;

export const ratingThresholdSchema = z
  .number()
  .min(1, "El umbral mínimo debe estar entre 1 y 5")
  .max(5, "El umbral mínimo debe estar entre 1 y 5");

const friendIdsArraySchema = z
  .array(z.string().trim().min(1))
  .max(50, "No se pueden seleccionar más de 50 amigos");

export const festivalComparisonQuerySchema = z.object({
  editionId: z.string().trim().min(1, "Edición de festival obligatoria"),
  friendIds: friendIdsArraySchema.optional(),
  sortBy: comparisonSortModeSchema.optional(),
  onlyRated: z.boolean().optional(),
});
export type FestivalComparisonQueryInput = z.infer<typeof festivalComparisonQuerySchema>;

export const createFestivalComparisonSchema = z.object({
  editionId: z.string().trim().min(1, "Edición de festival obligatoria"),
  friendIds: friendIdsArraySchema.optional(),
  name: z
    .string()
    .trim()
    .max(120, "El nombre de la comparativa no puede superar los 120 caracteres")
    .optional(),
});
export type CreateFestivalComparisonInput = z.infer<typeof createFestivalComparisonSchema>;

export const updateFestivalComparisonSchema = z.object({
  comparisonId: z.string().trim().min(1),
  name: z
    .string()
    .trim()
    .max(120, "El nombre de la comparativa no puede superar los 120 caracteres")
    .optional(),
  friendIds: friendIdsArraySchema.optional(),
});
export type UpdateFestivalComparisonInput = z.infer<typeof updateFestivalComparisonSchema>;

export const festivalComparisonIdSchema = z.object({
  comparisonId: z.string().trim().min(1),
});
export type FestivalComparisonIdInput = z.infer<typeof festivalComparisonIdSchema>;

export const createJointAgendaSchema = z
  .object({
    comparisonId: z.string().trim().min(1).optional(),
    editionId: z.string().trim().min(1).optional(),
    friendIds: friendIdsArraySchema.optional(),
    name: z
      .string()
      .trim()
      .max(120, "El nombre de la agenda conjunta no puede superar los 120 caracteres")
      .optional(),
    strategy: jointAgendaStrategySchema.default("RECOMMENDED"),
    minRatingThreshold: ratingThresholdSchema.optional(),
    entryIds: z
      .array(z.string().trim().min(1))
      .max(2_000, "Demasiadas entradas seleccionadas")
      .optional(),
  })
  .refine((val) => Boolean(val.comparisonId || val.editionId), {
    error: "Debes indicar una comparativa guardada o una edición de festival",
    path: ["editionId"],
  })
  .refine(
    (val) => val.strategy !== "CUSTOM" || (val.entryIds !== undefined && val.entryIds.length > 0),
    {
      error: "Selecciona al menos un concierto para crear una agenda personalizada",
      path: ["entryIds"],
    },
  );
export type CreateJointAgendaInput = z.input<typeof createJointAgendaSchema>;

export const updateJointAgendaSchema = z.object({
  agendaId: z.string().trim().min(1),
  name: z
    .string()
    .trim()
    .max(120, "El nombre de la agenda conjunta no puede superar los 120 caracteres")
    .optional(),
  minRatingThreshold: ratingThresholdSchema.optional(),
  friendIds: friendIdsArraySchema.optional(),
});
export type UpdateJointAgendaInput = z.infer<typeof updateJointAgendaSchema>;

export const setJointAgendaEntrySchema = z.object({
  agendaId: z.string().trim().min(1),
  entryId: z.string().trim().min(1),
  included: z.boolean().optional(),
  note: z
    .string()
    .trim()
    .max(280, "La nota de grupo no puede superar los 280 caracteres")
    .optional(),
});
export type SetJointAgendaEntryInput = z.infer<typeof setJointAgendaEntrySchema>;

export const regenerateJointAgendaSchema = z.object({
  agendaId: z.string().trim().min(1),
  strategy: jointAgendaStrategySchema.default("RECOMMENDED"),
  minRatingThreshold: ratingThresholdSchema.optional(),
  preserveManualEntries: z.boolean().default(false),
});
export type RegenerateJointAgendaInput = z.input<typeof regenerateJointAgendaSchema>;

export const jointAgendaIdSchema = z.object({
  agendaId: z.string().trim().min(1),
});
export type JointAgendaIdInput = z.infer<typeof jointAgendaIdSchema>;

// Festival & Edition schemas

const lineupUrlField = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .refine(
    (value) => !value || (URL.canParse(value) && /^https?:\/\//i.test(value)),
    "Debe ser una URL válida (http:// o https://)",
  );

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
    lineupSourceUrl: lineupUrlField,
    autoSyncEnabled: z.boolean().optional(),
    syncIntervalHours: z.coerce.number().int().min(1).max(168).optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    error: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });
export type CreateFestivalInput = z.infer<typeof createFestivalSchema>;

export const createFestivalEditionSchema = z
  .object({
    festivalId: z.string().min(1),
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
    lineupSourceUrl: lineupUrlField,
    autoSyncEnabled: z.boolean().optional(),
    syncIntervalHours: z.coerce.number().int().min(1).max(168).optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    error: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });
export type CreateFestivalEditionInput = z.infer<typeof createFestivalEditionSchema>;

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

export const userEditionMembershipSchema = z.object({
  editionId: z.string().min(1),
});
export type UserEditionMembershipInput = z.infer<typeof userEditionMembershipSchema>;

export const updateFestivalSyncConfigSchema = z.object({
  festivalId: z.string().min(1),
  lineupSourceUrl: lineupUrlField,
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
