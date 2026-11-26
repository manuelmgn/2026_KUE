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
  return runAction(async () => {
    const updated = await updateArtistRating(input);
    revalidatePath("/");
    revalidatePath("/festival-mode");
    return { id: updated.id, rating: updated.rating, status: updated.status };
  }, "No se pudo guardar la valoración");
}

export async function setArtistStatusAction(
  input: UpdateArtistStatusInput,
): Promise<ActionResult<{ id: string; status: ArtistStatus }>> {
  return runAction(async () => {
    const updated = await updateArtistStatus(input);
    revalidatePath("/");
    revalidatePath("/festival-mode");
    return { id: updated.id, status: updated.status };
  }, "No se pudo cambiar el estado");
}

export async function saveArtistNotesAction(
  input: UpdateArtistNotesInput,
): Promise<ActionResult<{ id: string; notes: string }>> {
  return runAction(async () => {
    const updated = await updateArtistNotes(input);
    revalidatePath("/");
    revalidatePath("/festival-mode");
    return { id: updated.id, notes: updated.notes };
  }, "No se pudieron guardar las notas");
}

export async function toggleAlbumPinAction(
  input: UpdateAlbumPinInput,
): Promise<ActionResult<{ id: string; isPinned: boolean }>> {
  return runAction(async () => {
    const updated = await updateAlbumPin(input);
    revalidatePath("/");
    return { id: updated.id, isPinned: updated.isPinned };
  }, "No se pudo actualizar el disco fijado");
}

export async function saveAlbumCustomUrlAction(
  input: UpdateAlbumCustomUrlInput,
): Promise<ActionResult<{ id: string; customUrl: string | null }>> {
  return runAction(async () => {
    const updated = await updateAlbumCustomUrl(input);
    revalidatePath("/");
    return { id: updated.id, customUrl: updated.customUrl };
  }, "No se pudo guardar el enlace del álbum");
}

export async function disambiguateArtistAction(
  input: DisambiguateArtistInput,
): Promise<
  ActionResult<{ id: string; mbid: string | null; country: string | null; syncStatus: SyncStatus }>
> {
  return runAction(async () => {
    const updated = await disambiguateArtist(input);
    revalidatePath("/");
    return {
      id: updated.id,
      mbid: updated.mbid,
      country: updated.country,
      syncStatus: updated.syncStatus,
    };
  }, "No se pudo actualizar el artista");
}
