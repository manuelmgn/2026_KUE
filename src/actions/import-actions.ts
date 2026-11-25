"use server";

import { revalidatePath } from "next/cache";
import type { ImportLineupInput } from "@/domain/schemas";
import { importFestivalLineup } from "@/server/services/importer";

export async function importLineupAction(input: ImportLineupInput) {
  const result = await importFestivalLineup(input);
  revalidatePath("/");
  revalidatePath("/festival-mode");
  revalidatePath("/import");
  return result;
}
