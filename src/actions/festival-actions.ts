"use server";

import { revalidatePath } from "next/cache";
import type { CreateFestivalInput } from "@/domain/schemas";
import { createFestival } from "@/server/services/festivals";

export async function createFestivalAction(input: CreateFestivalInput) {
  const created = await createFestival(input);
  revalidatePath("/");
  revalidatePath("/import");
  revalidatePath("/festival-mode");
  return {
    id: created.id,
    slug: created.slug,
    name: created.name,
    year: created.year,
    location: created.location,
  };
}
