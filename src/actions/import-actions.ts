"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { ImportLineupInput } from "@/domain/schemas";
import { type ImportLineupResult, importFestivalLineup } from "@/server/services/importer";

export async function importLineupAction(
  input: ImportLineupInput,
): Promise<ActionResult<ImportLineupResult>> {
  return runAction(async () => {
    const result = await importFestivalLineup(input);
    revalidatePath("/");
    revalidatePath("/festival-mode");
    revalidatePath("/import");
    return result;
  }, "Error guardando el cartel");
}
