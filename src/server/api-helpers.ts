import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ForbiddenError, UnauthorizedError } from "@/domain/errors";

/**
 * Safely parses a JSON object body from a Request.
 * Throws `DomainError` (HTTP 400) on malformed JSON or non-object payloads (arrays, null, primitives).
 */
export async function parseJsonObjectBody(
  request: Request,
  options: { allowEmpty?: boolean } = {},
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) {
    if (options.allowEmpty) {
      return {};
    }
    throw new DomainError("El cuerpo de la petición no puede estar vacío");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainError("Cuerpo JSON no válido");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DomainError("El cuerpo JSON debe ser un objeto");
  }

  return parsed as Record<string, unknown>;
}

export function handleGroupPlanningApiError(error: unknown, contextLabel: string): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 },
    );
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(`[KUE] ${contextLabel}:`, error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}
