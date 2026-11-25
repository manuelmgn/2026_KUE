import type { ArtistStatus, ReleaseType, SyncStatus } from "@/domain/schemas";

export interface FestivalSummary {
  id: string;
  slug: string;
  name: string;
  year: number;
  location: string | null;
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
