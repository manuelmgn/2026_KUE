"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type ActionResult, runAction } from "@/actions/result";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requireActionUser } from "@/server/auth/dal";
import { extractClientIp } from "@/server/auth/rate-limit";
import { invalidateCurrentSession, setSessionCookie } from "@/server/auth/session";
import {
  authenticateUser,
  changeOwnPassword,
  type PublicUserDTO,
  registerUser,
} from "@/server/services/users";

export async function loginAction(
  input: LoginInput,
): Promise<ActionResult<{ user: PublicUserDTO }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const headerStore = await headers();
    const ipAddress = extractClientIp(headerStore);
    const userAgent = headerStore.get("user-agent");
    const result = await authenticateUser(input, { ipAddress, userAgent });
    await setSessionCookie(result.rawToken, result.expiresAt);
    revalidatePath("/", "layout");
    return { user: result.user };
  }, dict.common.unexpectedError);
}

export async function registerAction(
  input: RegisterInput,
): Promise<ActionResult<{ user: PublicUserDTO; isFirstAdmin: boolean }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const headerStore = await headers();
    const ipAddress = extractClientIp(headerStore);
    const userAgent = headerStore.get("user-agent");
    const result = await registerUser(input, { ipAddress, userAgent });
    await setSessionCookie(result.rawToken, result.expiresAt);
    revalidatePath("/", "layout");
    return { user: result.user, isFirstAdmin: result.isFirstAdmin };
  }, dict.common.unexpectedError);
}

export async function logoutAction(): Promise<ActionResult<{ loggedOut: true }>> {
  return runAction(async () => {
    await invalidateCurrentSession();
    revalidatePath("/", "layout");
    return { loggedOut: true };
  });
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ActionResult<{ changed: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    await changeOwnPassword(user.id, input, user.sessionId);
    return { changed: true };
  }, dict.common.unexpectedError);
}
