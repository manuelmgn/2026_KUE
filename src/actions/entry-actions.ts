"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { UpdateEntryScheduleInput } from "@/domain/schemas";
import { updateEntrySchedule } from "@/server/services/entries";

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
  return runAction(async () => {
    const updated = await updateEntrySchedule(input);
    revalidatePath("/");
    revalidatePath("/festival-mode");
    return {
      id: updated.id,
      day: updated.day,
      stage: updated.stage,
      setTime: updated.setTime,
      liveRating: updated.liveRating,
      liveNotes: updated.liveNotes,
    };
  }, "No se pudo guardar el pase");
}
