import { ZodError } from "zod";
import { DomainError } from "@/domain/errors";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Wraps a Server Action so expected validation (`ZodError`) and business (`DomainError`)
 * messages are returned as serializable data instead of thrown — Next.js redacts thrown
 * error messages in production builds.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  fallbackMessage = "Ha ocurrido un error inesperado",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const first = error.issues[0]?.message;
      return { ok: false, error: first || "Datos no válidos" };
    }
    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }
    console.error("[KUE] Server Action failed:", error);
    return { ok: false, error: fallbackMessage };
  }
}
