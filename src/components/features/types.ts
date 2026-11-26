import type { PendingLineupDiff } from "@/domain/lineup-diff";
import type {
  ArtistStatus,
  LineupSyncMode,
  ReleaseType,
  SyncStatus,
  UserRole,
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
  slug: string;
  name: string;
  year: number;
  location: string | null;
}

export interface FestivalArchiveItemDTO extends FestivalSummary {
  startDate: string | null;
  endDate: string | null;
  entriesCount: number;
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
  festivalName: string;
  festivalYear: number;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  liveRating: number | null;
  liveNotes: string;
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
}
