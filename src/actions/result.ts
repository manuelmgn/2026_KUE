import { ZodError } from "zod";
import { DomainError } from "@/domain/errors";
import { getServerDictionary } from "@/i18n/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Wraps a Server Action so expected validation (`ZodError`) and business (`DomainError`)
 * messages are returned as serializable data instead of thrown — Next.js redacts thrown
 * error messages in production builds.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  fallbackMessage?: string,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error: unknown) {
    const { dict } = await getServerDictionary();
    if (error instanceof ZodError) {
      const first = error.issues[0]?.message;
      return { ok: false, error: first || dict.common.invalidData };
    }
    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }
    console.error("[KUE] Server Action failed:", error);
    return { ok: false, error: fallbackMessage ?? dict.common.unexpectedError };
  }
}
