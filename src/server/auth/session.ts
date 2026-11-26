import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PrismaClient, UserRole } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export const SESSION_COOKIE_NAME = "kue_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // Renew when <15 days remain

export interface AuthSessionUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function shouldUseSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }
  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

export async function createSessionRecord(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
  db: PrismaClient = getDb(),
): Promise<{ rawToken: string; sessionId: string; expiresAt: Date }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const created = await db.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 100) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  // Opportunistic cleanup of expired sessions
  void db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);

  return { rawToken, sessionId: created.id, expiresAt };
}

export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    expires: new Date(0),
  });
}

export async function validateSessionToken(
  rawToken: string,
  db: PrismaClient = getDb(),
): Promise<{ user: AuthSessionUser; renewedExpiresAt: Date | null } | null> {
  if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  let renewedExpiresAt: Date | null = null;
  if (session.expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS) {
    renewedExpiresAt = new Date(now + SESSION_DURATION_MS);
    await db.session
      .update({
        where: { id: session.id },
        data: { expiresAt: renewedExpiresAt, lastSeenAt: new Date(now) },
      })
      .catch(() => undefined);
  }

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    },
    renewedExpiresAt,
  };
}

export async function invalidateCurrentSession(db: PrismaClient = getDb()): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await db.session.deleteMany({ where: { tokenHash } }).catch(() => undefined);
  }
  await clearSessionCookie();
}

export async function invalidateAllUserSessions(
  userId: string,
  options: { exceptSessionId?: string; db?: PrismaClient } = {},
): Promise<void> {
  const db = options.db ?? getDb();
  await db.session.deleteMany({
    where: {
      userId,
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
    },
  });
}
