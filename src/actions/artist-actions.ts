"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type {
  ArtistStatus,
  DisambiguateArtistInput,
  SyncStatus,
  UpdateAlbumCustomUrlInput,
  UpdateAlbumPinInput,
  UpdateArtistNotesInput,
  UpdateArtistRatingInput,
  UpdateArtistStatusInput,
} from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
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

export async function setArtistRatingAction(
  input: UpdateArtistRatingInput,
): Promise<ActionResult<{ id: string; rating: number | null; status: ArtistStatus }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateArtistRating(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    return { id: updated.id, rating: updated.rating, status: updated.status };
  }, dict.errors.saveRating);
}

export async function setArtistStatusAction(
  input: UpdateArtistStatusInput,
): Promise<ActionResult<{ id: string; status: ArtistStatus }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateArtistStatus(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    return { id: updated.id, status: updated.status };
  }, dict.errors.changeStatus);
}

export async function saveArtistNotesAction(
  input: UpdateArtistNotesInput,
): Promise<ActionResult<{ id: string; notes: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateArtistNotes(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    return { id: updated.id, notes: updated.notes };
  }, dict.errors.saveNotes);
}

export async function toggleAlbumPinAction(
  input: UpdateAlbumPinInput,
): Promise<ActionResult<{ id: string; isPinned: boolean }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateAlbumPin(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    return { id: updated.id, isPinned: updated.isPinned };
  }, dict.errors.togglePin);
}

export async function saveAlbumCustomUrlAction(
  input: UpdateAlbumCustomUrlInput,
): Promise<ActionResult<{ id: string; customUrl: string | null }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateAlbumCustomUrl(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    return { id: updated.id, customUrl: updated.customUrl };
  }, dict.errors.saveAlbumUrl);
}

export async function disambiguateArtistAction(
  input: DisambiguateArtistInput,
): Promise<
  ActionResult<{ id: string; mbid: string | null; country: string | null; syncStatus: SyncStatus }>
> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await disambiguateArtist(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    return {
      id: updated.id,
      mbid: updated.mbid,
      country: updated.country,
      syncStatus: updated.syncStatus,
    };
  }, dict.errors.disambiguateArtist);
}
