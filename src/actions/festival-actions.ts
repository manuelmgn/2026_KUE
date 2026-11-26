"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { FestivalSummary } from "@/components/features/types";
import type {
  ApplyLineupDiffInput,
  CreateFestivalInput,
  UpdateFestivalInput,
  UpdateFestivalSyncConfigInput,
} from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { createFestival, updateFestival } from "@/server/services/festivals";
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

export async function createFestivalAction(
  input: CreateFestivalInput,
): Promise<ActionResult<CreateFestivalActionResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const created = await createFestival(input);

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

    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/manage");
    revalidatePath("/import");
    revalidatePath("/festival-mode");
    return {
      ...toFestivalSummary(created),
      initialEntriesCount,
      initialNewArtistsCount,
      initialSyncError,
    };
  }, dict.errors.createFestival);
}

export async function updateFestivalAction(
  input: UpdateFestivalInput,
): Promise<ActionResult<FestivalSummary>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const updated = await updateFestival(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/manage");
    revalidatePath("/import");
    revalidatePath("/festival-mode");
    return toFestivalSummary(updated);
  }, dict.errors.updateFestival);
}

export async function updateFestivalSyncConfigAction(
  input: UpdateFestivalSyncConfigInput,
): Promise<ActionResult<{ festivalId: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
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
    const result = await checkFestivalLineupSync(festivalId, { force });
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/manage");
    revalidatePath("/festival-mode");
    return result;
  }, dict.errors.importLineup);
}

export async function applyPendingLineupDiffAction(
  input: ApplyLineupDiffInput,
): Promise<ActionResult<ApplyLineupDiffResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const result = await applyPendingLineupDiff(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/manage");
    revalidatePath("/festival-mode");
    return result;
  }, dict.errors.importLineup);
}

export async function dismissPendingLineupDiffAction(
  festivalId: string,
): Promise<ActionResult<{ dismissed: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await dismissPendingLineupDiff(festivalId);
    revalidatePath("/manage");
    return { dismissed: true };
  }, dict.errors.updateFestival);
}
