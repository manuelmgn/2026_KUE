"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { ImportLineupInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { type ImportLineupResult, importFestivalLineup } from "@/server/services/importer";

export async function importLineupAction(
  input: ImportLineupInput,
): Promise<ActionResult<ImportLineupResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const result = await importFestivalLineup(input);
    revalidatePath("/");
    revalidatePath("/festivals");
    revalidatePath("/festival-mode");
    revalidatePath("/import");
    return result;
  }, dict.errors.importLineup);
}
