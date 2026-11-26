"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { FestivalArchiveItemDTO, FestivalSummary } from "@/components/features/types";
import type {
  ApplyLineupDiffInput,
  CreateFestivalEditionInput,
  CreateFestivalInput,
  UpdateFestivalInput,
  UpdateFestivalSyncConfigInput,
} from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requireActionAdmin, requireActionUser } from "@/server/auth/dal";
import {
  addEditionToUserFestivals,
  createFestival,
  createFestivalEdition,
  removeEditionFromUserFestivals,
  updateFestival,
} from "@/server/services/festivals";
import {
  type ApplyLineupDiffResult,
  applyPendingLineupDiff,
  type CheckFestivalLineupResult,
  checkFestivalLineupSync,
  dismissPendingLineupDiff,
  updateFestivalSyncConfig,
} from "@/server/services/lineup-sync";
import { toFestivalSummary } from "@/server/services/mappers";

export interface CreateFestivalActionResult extends FestivalSummary {
  initialEntriesCount: number;
  initialNewArtistsCount: number;
  initialSyncError: string | null;
}

function revalidateFestivalViews() {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/lineup");
  revalidatePath("/festivals");
  revalidatePath("/manage");
  revalidatePath("/import");
  revalidatePath("/festival-mode");
}

export async function createFestivalAction(
  input: CreateFestivalInput,
): Promise<ActionResult<CreateFestivalActionResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const created = await createFestival(input, user.id);

    let initialEntriesCount = 0;
    let initialNewArtistsCount = 0;
    let initialSyncError: string | null = null;

    if (created.lineupSourceUrl) {
      try {
        const syncResult = await checkFestivalLineupSync(created.id, {
          force: true,
          applyDirectly: true,
        });
        initialEntriesCount = syncResult.addedCount;
        initialNewArtistsCount = syncResult.newArtistsCount;
      } catch (error: unknown) {
        initialSyncError = error instanceof Error ? error.message : dict.errors.importLineup;
      }
    }

    revalidateFestivalViews();
    return {
      ...toFestivalSummary(created),
      initialEntriesCount,
      initialNewArtistsCount,
      initialSyncError,
    };
  }, dict.errors.createFestival);
}

export async function createFestivalEditionAction(
  input: CreateFestivalEditionInput,
): Promise<ActionResult<CreateFestivalActionResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const created = await createFestivalEdition(input, user.id);

    let initialEntriesCount = 0;
    let initialNewArtistsCount = 0;
    let initialSyncError: string | null = null;

    if (created.lineupSourceUrl) {
      try {
        const syncResult = await checkFestivalLineupSync(created.id, {
          force: true,
          applyDirectly: true,
        });
        initialEntriesCount = syncResult.addedCount;
        initialNewArtistsCount = syncResult.newArtistsCount;
      } catch (error: unknown) {
        initialSyncError = error instanceof Error ? error.message : dict.errors.importLineup;
      }
    }

    revalidateFestivalViews();
    return {
      ...toFestivalSummary(created),
      initialEntriesCount,
      initialNewArtistsCount,
      initialSyncError,
    };
  }, dict.errors.createFestival);
}

export async function addEditionToMyFestivalsAction(
  editionId: string,
): Promise<ActionResult<FestivalArchiveItemDTO>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const edition = await addEditionToUserFestivals(user.id, editionId);
    revalidateFestivalViews();
    return {
      ...toFestivalSummary(edition),
      startDate: edition.startDate ? edition.startDate.toISOString().slice(0, 10) : null,
      endDate: edition.endDate ? edition.endDate.toISOString().slice(0, 10) : null,
      entriesCount: edition._count.entries,
    };
  }, dict.errors.updateFestival);
}

export async function removeEditionFromMyFestivalsAction(
  editionId: string,
): Promise<ActionResult<{ removed: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    await removeEditionFromUserFestivals(user.id, editionId);
    revalidateFestivalViews();
    return { removed: true };
  }, dict.errors.updateFestival);
}

export async function updateFestivalAction(
  input: UpdateFestivalInput,
): Promise<ActionResult<FestivalSummary>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionUser();
    const updated = await updateFestival(input);
    revalidateFestivalViews();
    return toFestivalSummary(updated);
  }, dict.errors.updateFestival);
}

export async function updateFestivalSyncConfigAction(
  input: UpdateFestivalSyncConfigInput,
): Promise<ActionResult<{ festivalId: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionUser();
    const updated = await updateFestivalSyncConfig(input);
    revalidatePath("/manage");
    return { festivalId: updated.id };
  }, dict.errors.updateFestival);
}

export async function checkFestivalLineupAction(
  festivalId: string,
  force = false,
): Promise<ActionResult<CheckFestivalLineupResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionAdmin();
    const result = await checkFestivalLineupSync(festivalId, { force });
    revalidateFestivalViews();
    return result;
  }, dict.errors.importLineup);
}

export async function applyPendingLineupDiffAction(
  input: ApplyLineupDiffInput,
): Promise<ActionResult<ApplyLineupDiffResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionUser();
    const result = await applyPendingLineupDiff(input);
    revalidateFestivalViews();
    return result;
  }, dict.errors.importLineup);
}

export async function dismissPendingLineupDiffAction(
  festivalId: string,
): Promise<ActionResult<{ dismissed: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionUser();
    await dismissPendingLineupDiff(festivalId);
    revalidatePath("/manage");
    return { dismissed: true };
  }, dict.errors.updateFestival);
}
