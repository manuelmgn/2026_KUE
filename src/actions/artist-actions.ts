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
import { requireActionUser } from "@/server/auth/dal";
import {
  disambiguateArtist,
  getArtistDetail,
  searchCatalogArtists,
  updateAlbumCustomUrl,
  updateAlbumPin,
  updateArtistNotes,
  updateArtistRating,
  updateArtistStatus,
} from "@/server/services/artists";

export async function getArtistDetailAction(artistId: string) {
  const user = await requireActionUser();
  return getArtistDetail(user.id, artistId);
}

export async function searchArtistsAction(query: string) {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    return searchCatalogArtists(user.id, query, 48);
  }, dict.common.unexpectedError);
}

export async function setArtistRatingAction(
  input: UpdateArtistRatingInput,
): Promise<ActionResult<{ id: string; rating: number | null; status: ArtistStatus }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateArtistRating(user.id, input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    revalidatePath("/social");
    return { id: updated.id, rating: updated.rating, status: updated.status };
  }, dict.errors.saveRating);
}

export async function setArtistStatusAction(
  input: UpdateArtistStatusInput,
): Promise<ActionResult<{ id: string; status: ArtistStatus }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateArtistStatus(user.id, input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    revalidatePath("/social");
    return { id: updated.id, status: updated.status };
  }, dict.errors.changeStatus);
}

export async function saveArtistNotesAction(
  input: UpdateArtistNotesInput,
): Promise<ActionResult<{ id: string; notes: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateArtistNotes(user.id, input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    revalidatePath("/social");
    return { id: updated.id, notes: updated.notes };
  }, dict.errors.saveNotes);
}

export async function toggleAlbumPinAction(
  input: UpdateAlbumPinInput,
): Promise<ActionResult<{ id: string; isPinned: boolean }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateAlbumPin(user.id, input);
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
    const user = await requireActionUser();
    const updated = await updateAlbumCustomUrl(user.id, input);
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
    await requireActionUser();
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
