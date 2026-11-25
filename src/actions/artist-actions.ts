"use server";

import { revalidatePath } from "next/cache";
import type {
  DisambiguateArtistInput,
  UpdateAlbumCustomUrlInput,
  UpdateAlbumPinInput,
  UpdateArtistNotesInput,
  UpdateArtistRatingInput,
  UpdateArtistStatusInput,
} from "@/domain/schemas";
import {
  disambiguateArtist,
  getArtistDetail,
  updateAlbumCustomUrl,
  updateAlbumPin,
  updateArtistNotes,
  updateArtistRating,
  updateArtistStatus,
} from "@/server/services/artists";

export async function getArtistDetailAction(artistId: string) {
  return getArtistDetail(artistId);
}

export async function setArtistRatingAction(input: UpdateArtistRatingInput) {
  const updated = await updateArtistRating(input);
  revalidatePath("/");
  revalidatePath("/festival-mode");
  return { id: updated.id, rating: updated.rating, status: updated.status };
}

export async function setArtistStatusAction(input: UpdateArtistStatusInput) {
  const updated = await updateArtistStatus(input);
  revalidatePath("/");
  revalidatePath("/festival-mode");
  return { id: updated.id, status: updated.status };
}

export async function saveArtistNotesAction(input: UpdateArtistNotesInput) {
  const updated = await updateArtistNotes(input);
  revalidatePath("/");
  revalidatePath("/festival-mode");
  return { id: updated.id, notes: updated.notes };
}

export async function toggleAlbumPinAction(input: UpdateAlbumPinInput) {
  const updated = await updateAlbumPin(input);
  revalidatePath("/");
  return { id: updated.id, isPinned: updated.isPinned };
}

export async function saveAlbumCustomUrlAction(input: UpdateAlbumCustomUrlInput) {
  const updated = await updateAlbumCustomUrl(input);
  revalidatePath("/");
  return { id: updated.id, customUrl: updated.customUrl };
}

export async function disambiguateArtistAction(input: DisambiguateArtistInput) {
  const updated = await disambiguateArtist(input);
  revalidatePath("/");
  return {
    id: updated.id,
    mbid: updated.mbid,
    country: updated.country,
    syncStatus: updated.syncStatus,
  };
}
