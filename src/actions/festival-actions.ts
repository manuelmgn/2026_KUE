"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { FestivalSummary } from "@/components/features/types";
import type { CreateFestivalInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { createFestival } from "@/server/services/festivals";
import { toFestivalSummary } from "@/server/services/mappers";

export async function createFestivalAction(
  input: CreateFestivalInput,
): Promise<ActionResult<FestivalSummary>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const created = await createFestival(input);
    revalidatePath("/");
    revalidatePath("/import");
    revalidatePath("/festival-mode");
    return toFestivalSummary(created);
  }, dict.errors.createFestival);
}
