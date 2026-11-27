import { randomBytes } from "node:crypto";
import { DomainError } from "@/domain/errors";
import {
  type CreateInvitationInput,
  createInvitationSchema,
  INVITATION_DURATION_MS,
  type RevokeInvitationInput,
  revokeInvitationSchema,
} from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export type InvitationStatus = "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "REVOKED";

export interface InvitationLinkDTO {
  id: string;
  token: string;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: InvitationStatus;
  createdByUsername: string | null;
  registeredUsernames: string[];
}

export type InviteValidationResult =
  | {
      status: "valid";
      id: string;
      maxUses: number;
      usedCount: number;
      remainingUses: number;
      expiresAt: string;
    }
  | {
      status: "missing" | "invalid" | "expired" | "exhausted" | "revoked";
    };

export function generateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}

export function computeInvitationStatus(
  invite: {
    maxUses: number;
    usedCount: number;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  now: Date = new Date(),
): InvitationStatus {
  if (invite.revokedAt !== null) {
    return "REVOKED";
  }
  if (invite.usedCount >= invite.maxUses) {
    return "EXHAUSTED";
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

function toInvitationLinkDTO(
  row: {
    id: string;
    token: string;
    maxUses: number;
    usedCount: number;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    createdBy: { username: string } | null;
    registeredUsers: Array<{ username: string }>;
  },
  now: Date = new Date(),
): InvitationLinkDTO {
  return {
    id: row.id,
    token: row.token,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    remainingUses: Math.max(0, row.maxUses - row.usedCount),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    status: computeInvitationStatus(row, now),
    createdByUsername: row.createdBy?.username ?? null,
    registeredUsernames: row.registeredUsers.map((user) => user.username),
  };
}

const INVITATION_INCLUDE = {
  createdBy: { select: { username: true } },
  registeredUsers: {
    select: { username: true },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function createInvitationLink(
  createdById: string,
  rawInput: CreateInvitationInput = {},
  db: PrismaClient = getDb(),
): Promise<InvitationLinkDTO> {
  const input = createInvitationSchema.parse(rawInput);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_DURATION_MS[input.duration]);
  const token = generateInvitationToken();

  const created = await db.invitationLink.create({
    data: {
      token,
      createdById,
      maxUses: input.maxUses,
      expiresAt,
      createdAt: now,
    },
    include: INVITATION_INCLUDE,
  });

  return toInvitationLinkDTO(created, now);
}

export async function listInvitationLinks(
  db: PrismaClient = getDb(),
): Promise<InvitationLinkDTO[]> {
  const now = new Date();
  const rows = await db.invitationLink.findMany({
    orderBy: { createdAt: "desc" },
    include: INVITATION_INCLUDE,
  });

  return rows.map((row) => toInvitationLinkDTO(row, now));
}

export async function revokeInvitationLink(
  rawInput: RevokeInvitationInput,
  db: PrismaClient = getDb(),
): Promise<InvitationLinkDTO> {
  const input = revokeInvitationSchema.parse(rawInput);
  const existing = await db.invitationLink.findUnique({
    where: { id: input.invitationId },
    include: INVITATION_INCLUDE,
  });

  if (!existing) {
    throw new DomainError("Enlace de invitación no encontrado");
  }

  const now = new Date();
  if (existing.revokedAt !== null) {
    return toInvitationLinkDTO(existing, now);
  }

  const updated = await db.invitationLink.update({
    where: { id: existing.id },
    data: { revokedAt: now },
    include: INVITATION_INCLUDE,
  });

  return toInvitationLinkDTO(updated, now);
}

export async function validateInvitationToken(
  rawToken: string | null | undefined,
  db: PrismaClient = getDb(),
): Promise<InviteValidationResult> {
  const token = rawToken?.trim() ?? "";
  if (!token) {
    return { status: "missing" };
  }
  if (token.length > 128) {
    return { status: "invalid" };
  }

  const invite = await db.invitationLink.findUnique({
    where: { token },
    select: {
      id: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!invite) {
    return { status: "invalid" };
  }

  const status = computeInvitationStatus(invite);
  if (status === "REVOKED") {
    return { status: "revoked" };
  }
  if (status === "EXPIRED") {
    return { status: "expired" };
  }
  if (status === "EXHAUSTED") {
    return { status: "exhausted" };
  }

  return {
    status: "valid",
    id: invite.id,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    remainingUses: Math.max(0, invite.maxUses - invite.usedCount),
    expiresAt: invite.expiresAt.toISOString(),
  };
}
