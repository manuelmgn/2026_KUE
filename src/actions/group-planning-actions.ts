"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type {
  CoincidingFestivalDTO,
  FestivalComparisonTableDTO,
  JointAgendaDetailDTO,
  JointAgendaSummaryDTO,
  SavedFestivalComparisonDTO,
  SavedFestivalComparisonSummaryDTO,
} from "@/domain/group-planning";
import type {
  ComparisonSortMode,
  CreateFestivalComparisonInput,
  CreateJointAgendaInput,
  FestivalComparisonQueryInput,
  RegenerateJointAgendaInput,
  SetJointAgendaEntryInput,
  UpdateFestivalComparisonInput,
  UpdateJointAgendaInput,
} from "@/domain/schemas";
import { requireActionUser } from "@/server/auth/dal";
import {
  createFestivalComparison,
  createJointAgenda,
  deleteFestivalComparison,
  deleteJointAgenda,
  getFestivalComparison,
  getJointAgenda,
  getSavedFestivalComparison,
  leaveJointAgenda,
  listCoincidingFestivals,
  listJointAgendas,
  listSavedFestivalComparisons,
  regenerateJointAgenda,
  setJointAgendaEntry,
  updateFestivalComparison,
  updateJointAgenda,
} from "@/server/services/group-planning";

function revalidateGroupPlanningPaths() {
  revalidatePath("/social");
  revalidatePath("/festivals");
  revalidatePath("/");
}

export async function listCoincidingFestivalsAction(): Promise<
  ActionResult<CoincidingFestivalDTO[]>
> {
  return runAction(async () => {
    const user = await requireActionUser();
    return listCoincidingFestivals(user.id);
  });
}

export async function getFestivalComparisonAction(
  input: FestivalComparisonQueryInput,
): Promise<ActionResult<FestivalComparisonTableDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    return getFestivalComparison(user.id, input);
  });
}

export async function createFestivalComparisonAction(
  input: CreateFestivalComparisonInput,
): Promise<ActionResult<SavedFestivalComparisonDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const created = await createFestivalComparison(user.id, input);
    revalidateGroupPlanningPaths();
    return created;
  });
}

export async function listSavedFestivalComparisonsAction(
  editionId?: string,
): Promise<ActionResult<SavedFestivalComparisonSummaryDTO[]>> {
  return runAction(async () => {
    const user = await requireActionUser();
    return listSavedFestivalComparisons(user.id, {
      ...(editionId !== undefined ? { editionId } : {}),
    });
  });
}

export async function getSavedFestivalComparisonAction(
  comparisonId: string,
  options: { sortBy?: ComparisonSortMode; onlyRated?: boolean } = {},
): Promise<ActionResult<SavedFestivalComparisonDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    return getSavedFestivalComparison(user.id, comparisonId, options);
  });
}

export async function updateFestivalComparisonAction(
  input: UpdateFestivalComparisonInput,
): Promise<ActionResult<SavedFestivalComparisonDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateFestivalComparison(user.id, input);
    revalidateGroupPlanningPaths();
    return updated;
  });
}

export async function deleteFestivalComparisonAction(
  comparisonId: string,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    await deleteFestivalComparison(user.id, { comparisonId });
    revalidateGroupPlanningPaths();
    return { deleted: true };
  });
}

export async function createJointAgendaAction(
  input: CreateJointAgendaInput,
): Promise<ActionResult<JointAgendaDetailDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const created = await createJointAgenda(user.id, input);
    revalidateGroupPlanningPaths();
    return created;
  });
}

export async function listJointAgendasAction(
  editionId?: string,
): Promise<ActionResult<JointAgendaSummaryDTO[]>> {
  return runAction(async () => {
    const user = await requireActionUser();
    return listJointAgendas(user.id, {
      ...(editionId !== undefined ? { editionId } : {}),
    });
  });
}

export async function getJointAgendaAction(
  agendaId: string,
): Promise<ActionResult<JointAgendaDetailDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    return getJointAgenda(user.id, agendaId);
  });
}

export async function updateJointAgendaAction(
  input: UpdateJointAgendaInput,
): Promise<ActionResult<JointAgendaDetailDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateJointAgenda(user.id, input);
    revalidateGroupPlanningPaths();
    return updated;
  });
}

export async function setJointAgendaEntryAction(
  input: SetJointAgendaEntryInput,
): Promise<ActionResult<JointAgendaDetailDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await setJointAgendaEntry(user.id, input);
    revalidateGroupPlanningPaths();
    return updated;
  });
}

export async function regenerateJointAgendaAction(
  input: RegenerateJointAgendaInput,
): Promise<ActionResult<JointAgendaDetailDTO>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await regenerateJointAgenda(user.id, input);
    revalidateGroupPlanningPaths();
    return updated;
  });
}

export async function leaveJointAgendaAction(
  agendaId: string,
): Promise<ActionResult<{ left: true }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    await leaveJointAgenda(user.id, { agendaId });
    revalidateGroupPlanningPaths();
    return { left: true };
  });
}

export async function deleteJointAgendaAction(
  agendaId: string,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    await deleteJointAgenda(user.id, { agendaId });
    revalidateGroupPlanningPaths();
    return { deleted: true };
  });
}
