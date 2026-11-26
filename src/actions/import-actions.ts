"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type { ImportLineupInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requireActionUser } from "@/server/auth/dal";
import { type ImportLineupResult, importFestivalLineup } from "@/server/services/importer";

export async function importLineupAction(
  input: ImportLineupInput,
): Promise<ActionResult<ImportLineupResult>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    await requireActionUser();
    const result = await importFestivalLineup(input);
    revalidatePath("/");
    revalidatePath("/lineup");
    revalidatePath("/festivals");
    revalidatePath("/festival-mode");
    revalidatePath("/manage");
    revalidatePath("/import");
    return result;
  }, dict.errors.importLineup);
}
