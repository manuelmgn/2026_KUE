import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError, UnauthorizedError } from "@/domain/errors";
import {
  type AuthSessionUser,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  validateSessionToken,
} from "@/server/auth/session";

export const getCurrentUser = cache(async (): Promise<AuthSessionUser | null> => {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const result = await validateSessionToken(rawToken);
  if (!result) {
    return null;
  }

  if (result.renewedExpiresAt) {
    try {
      await setSessionCookie(rawToken, result.renewedExpiresAt);
    } catch {
      // Cookie mutation is only allowed in Server Actions & Route Handlers; skip during RSC render
    }
  }

  return result.user;
});

/**
 * Use in Server Components (pages) to enforce authentication and redirect to `/login`.
 */
export async function requirePageUser(nextPath?: string): Promise<AuthSessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target =
      nextPath?.startsWith("/") && !nextPath.startsWith("//")
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : "/login";
    redirect(target);
  }
  return user;
}

/**
 * Use in Server Components (pages) to enforce ADMIN role.
 */
export async function requirePageAdmin(): Promise<AuthSessionUser> {
  const user = await requirePageUser("/admin");
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}

/**
 * Use in Server Actions & Route Handlers to enforce authentication.
 */
export async function requireActionUser(): Promise<AuthSessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

/**
 * Use in Server Actions & Route Handlers to enforce ADMIN role.
 */
export async function requireActionAdmin(): Promise<AuthSessionUser> {
  const user = await requireActionUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError();
  }
  return user;
}
