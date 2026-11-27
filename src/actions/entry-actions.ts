"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { DeleteEntryInput, UpdateEntryScheduleInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requireActionAdmin, requireActionUser } from "@/server/auth/dal";
import { deleteFestivalEntry, updateEntrySchedule } from "@/server/services/entries";

export async function updateEntryScheduleAction(input: UpdateEntryScheduleInput): Promise<
  ActionResult<{
    id: string;
    day: string | null;
    stage: string | null;
    setTime: string | null;
    liveRating: number | null;
    liveNotes: string;
  }>
> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateEntrySchedule(user.id, input, undefined, {
      allowSharedSchedule: user.role === "ADMIN",
    });
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festival-mode");
    revalidatePath("/manage");
    revalidatePath("/social");
    return updated;
  }, dict.errors.saveSchedule);
}

export async function deleteEntryAction(
  input: DeleteEntryInput,
): Promise<ActionResult<{ id: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionAdmin();
    const deleted = await deleteFestivalEntry(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/festival-mode");
    revalidatePath("/manage");
    return { id: deleted.id };
  }, dict.errors.deleteEntry);
}
