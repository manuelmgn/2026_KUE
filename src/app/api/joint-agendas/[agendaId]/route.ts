import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ForbiddenError, UnauthorizedError } from "@/domain/errors";
import type { JointAgendaStrategy } from "@/domain/schemas";
import { getCurrentUser } from "@/server/auth/dal";
import {
  deleteJointAgenda,
  getJointAgenda,
  leaveJointAgenda,
  regenerateJointAgenda,
  setJointAgendaEntry,
  updateJointAgenda,
} from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

function handleApiError(error: unknown): NextResponse {
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
  console.error("[KUE] Joint agenda detail API error:", error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agendaId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { agendaId } = await params;
    const agenda = await getJointAgenda(user.id, agendaId);
    return NextResponse.json(agenda, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

type PatchJointAgendaPayload =
  | {
      action: "setEntry";
      entryId: string;
      included?: boolean;
      note?: string;
    }
  | {
      action: "regenerate";
      strategy?: JointAgendaStrategy;
      minRatingThreshold?: number;
      preserveManualEntries?: boolean;
    }
  | {
      action: "leave";
    }
  | {
      action?: "update";
      name?: string;
      minRatingThreshold?: number;
      friendIds?: string[];
    };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agendaId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { agendaId } = await params;
    const body = (await request.json()) as PatchJointAgendaPayload;

    if (body.action === "setEntry") {
      const updated = await setJointAgendaEntry(user.id, {
        agendaId,
        entryId: body.entryId,
        ...(body.included !== undefined ? { included: body.included } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      });
      return NextResponse.json(updated, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (body.action === "regenerate") {
      const updated = await regenerateJointAgenda(user.id, {
        agendaId,
        ...(body.strategy !== undefined ? { strategy: body.strategy } : {}),
        ...(body.minRatingThreshold !== undefined
          ? { minRatingThreshold: body.minRatingThreshold }
          : {}),
        ...(body.preserveManualEntries !== undefined
          ? { preserveManualEntries: body.preserveManualEntries }
          : {}),
      });
      return NextResponse.json(updated, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (body.action === "leave") {
      await leaveJointAgenda(user.id, { agendaId });
      return NextResponse.json(
        { left: true },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const updated = await updateJointAgenda(user.id, {
      agendaId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.minRatingThreshold !== undefined
        ? { minRatingThreshold: body.minRatingThreshold }
        : {}),
      ...(body.friendIds !== undefined ? { friendIds: body.friendIds } : {}),
    });

    return NextResponse.json(updated, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ agendaId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { agendaId } = await params;
    await deleteJointAgenda(user.id, { agendaId });
    return NextResponse.json(
      { deleted: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
