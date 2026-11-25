"use server";

import { revalidatePath } from "next/cache";
import type { UpdateEntryScheduleInput } from "@/domain/schemas";
import { updateEntrySchedule } from "@/server/services/entries";

export async function updateEntryScheduleAction(input: UpdateEntryScheduleInput) {
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
}
