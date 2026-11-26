"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, type Locale, normalizeLocale } from "@/i18n/config";

export async function setLocaleAction(rawLocale: string): Promise<{ locale: Locale }> {
  const locale = normalizeLocale(rawLocale);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { locale };
}
