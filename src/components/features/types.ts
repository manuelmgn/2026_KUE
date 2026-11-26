import type { PendingLineupDiff } from "@/domain/lineup-diff";
import type {
  ArtistStatus,
  FriendshipStatus,
  LineupSyncMode,
  NotificationPayload,
  NotificationType,
  ReleaseType,
  SyncStatus,
  UserRole,
  VisibilityScope,
} from "@/domain/schemas";

export interface AuthUserDTO {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface FestivalSummary {
  id: string;
  festivalId: string;
  brandSlug: string;
  slug: string;
  name: string;
  year: number;
  location: string | null;
}

export interface FestivalArchiveItemDTO extends FestivalSummary {
  startDate: string | null;
  endDate: string | null;
  entriesCount: number;
  lineupSourceUrl?: string | null;
}

export interface CatalogEditionItemDTO {
  id: string;
  festivalId: string;
  slug: string;
  year: number;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  entriesCount: number;
  followersCount: number;
  isAdded: boolean;
}

export interface CatalogFestivalDTO {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  locationProvince: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  locationCountryCode: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationPlaceId: string | null;
  editions: CatalogEditionItemDTO[];
}

export interface FestivalEditDTO extends FestivalSummary {
  locationProvince: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  locationCountryCode: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationPlaceId: string | null;
  startDate: string | null;
  endDate: string | null;
  lineupSourceUrl: string | null;
  autoSyncEnabled: boolean;
  autoSyncMode: LineupSyncMode;
  syncIntervalHours: number;
  lastLineupSyncAt: string | null;
  lastLineupSyncError: string | null;
  pendingLineupDiff: PendingLineupDiff | null;
  existingYears: number[];
}

export interface HomeArtistItemDTO {
  id: string;
  name: string;
  imagePath: string | null;
  rating: number | null;
  status: ArtistStatus;
  notes: string;
  festivalSlug: string;
  festivalBrandSlug: string;
  festivalName: string;
  festivalYear: number;
}

export interface LineupArtistSummary {
  id: string;
  name: string;
  country: string | null;
  imagePath: string | null;
  rating: number | null;
  status: ArtistStatus;
  notes: string;
  syncStatus: SyncStatus;
}

export interface LineupEntryDTO {
  id: string;
  festivalId: string;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  liveRating: number | null;
  liveNotes: string;
  artists: LineupArtistSummary[];
}

export interface AlbumDTO {
  id: string;
  title: string;
  releaseYear: number | null;
  releaseType: ReleaseType;
  coverPath: string | null;
  isPinned: boolean;
  customUrl: string | null;
}

export interface FestivalAppearanceDTO {
  entryId: string;
  festivalId: string;
  festivalSlug: string;
  festivalBrandSlug: string;
  festivalName: string;
  festivalYear: number;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  liveRating: number | null;
  liveNotes: string;
  isInMyFestivals?: boolean;
}

export interface ArtistDetailDTO {
  id: string;
  name: string;
  mbid: string | null;
  country: string | null;
  bio: string | null;
  imagePath: string | null;
  rating: number | null;
  status: ArtistStatus;
  notes: string;
  syncStatus: SyncStatus;
  syncError: string | null;
  albums: AlbumDTO[];
  festivals: FestivalAppearanceDTO[];
  friendReviews: FriendArtistReviewDTO[];
}

export type RelationshipStatus =
  | "SELF"
  | "NONE"
  | "OUTGOING_PENDING"
  | "INCOMING_PENDING"
  | "FRIENDS";

export interface UserPrivacySettingsDTO {
  festivalsVisibility: VisibilityScope;
  ratingsVisibility: VisibilityScope;
  notesVisibility: VisibilityScope;
}

export interface UserProfileSummaryDTO {
  id: string;
  username: string;
  displayName: string | null;
  bio: string;
  location: string | null;
  avatarPath: string | null;
}

export interface FriendListItemDTO extends UserProfileSummaryDTO {
  friendshipId: string;
  status: FriendshipStatus;
  direction: "OUTGOING" | "INCOMING";
  sharedFestivalsCount: number;
  createdAt: string;
}

export interface UserSearchResultDTO extends UserProfileSummaryDTO {
  relationship: RelationshipStatus;
  friendshipId: string | null;
}

export type SocialPostKind = "ARTIST_REVIEW" | "LIVE_REVIEW" | "FESTIVAL_ADDED";

export interface SocialPostItemDTO {
  id: string;
  kind: SocialPostKind;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarPath: string | null;
  };
  artist: {
    id: string;
    name: string;
    imagePath: string | null;
    status?: ArtistStatus;
  } | null;
  festival: {
    id: string;
    slug: string;
    brandSlug: string;
    name: string;
    year: number;
    location: string | null;
  } | null;
  entry: {
    id: string;
    billingName: string;
    day: string | null;
    stage: string | null;
  } | null;
  rating: number | null;
  preRating?: number | null;
  notes: string | null;
}

export interface GlobalArtistSearchItemDTO {
  id: string;
  name: string;
  country: string | null;
  imagePath: string | null;
  rating: number | null;
  status: ArtistStatus;
  festivals: Array<{
    editionId: string;
    slug: string;
    brandSlug: string;
    name: string;
    year: number;
    isInMyFestivals: boolean;
  }>;
}

export interface SharedFestivalMatchDTO {
  editionId: string;
  slug: string;
  brandSlug: string;
  name: string;
  year: number;
  location: string | null;
  friendUsernames: string[];
  averageRating: number | null;
}

export interface FriendRadarPickDTO {
  artistId: string;
  artistName: string;
  editionId: string;
  festivalSlug: string;
  festivalBrandSlug: string;
  festivalName: string;
  festivalYear: number;
  yourStatus: ArtistStatus;
  backers: Array<{ username: string; rating: number }>;
}

export interface FriendArtistReviewDTO {
  userId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  rating: number | null;
  notes: string | null;
  liveRating: number | null;
  liveNotes: string | null;
  festivalName: string | null;
  festivalYear: number | null;
  updatedAt: string;
}

export interface UserProfileViewDTO {
  user: UserProfileSummaryDTO;
  relationship: RelationshipStatus;
  friendshipId: string | null;
  privacy: UserPrivacySettingsDTO | null;
  canViewFestivals: boolean;
  canViewRatings: boolean;
  canViewNotes: boolean;
  canViewActivity: boolean;
  sharedFestivals: FestivalSummary[];
  festivals: FestivalArchiveItemDTO[];
  posts: SocialPostItemDTO[];
  friendsCount: number | null;
}

export interface NotificationItemDTO {
  id: string;
  type: NotificationType;
  actorId: string | null;
  editionId: string | null;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
  pendingFriendshipId: string | null;
}

export interface NotificationsSnapshotDTO {
  unreadCount: number;
  items: NotificationItemDTO[];
}
