"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type {
  UserPrivacySettingsDTO,
  UserProfileSummaryDTO,
  UserSearchResultDTO,
} from "@/components/features/types";
import type { UpdatePrivacyInput, UpdateProfileInput } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requireActionUser } from "@/server/auth/dal";
import {
  acceptFriendRequest,
  removeOrRejectFriendship,
  searchUsersForFriends,
  sendFriendRequest,
} from "@/server/services/friends";
import { markAllNotificationsRead, markNotificationRead } from "@/server/services/notifications";
import { updateOwnPrivacy, updateOwnProfile } from "@/server/services/profile";

function revalidateSocialPaths(username?: string) {
  revalidatePath("/");
  revalidatePath("/social");
  revalidatePath("/notifications");
  revalidatePath("/settings");
  if (username) {
    revalidatePath(`/u/${encodeURIComponent(username)}`);
  }
}

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<ActionResult<UserProfileSummaryDTO>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateOwnProfile(user.id, input);
    revalidateSocialPaths(user.username);
    return updated;
  }, dict.errors.updateProfile);
}

export async function updatePrivacyAction(
  input: UpdatePrivacyInput,
): Promise<ActionResult<UserPrivacySettingsDTO>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const updated = await updateOwnPrivacy(user.id, input);
    revalidateSocialPaths(user.username);
    return updated;
  }, dict.errors.updatePrivacy);
}

export async function searchUsersAction(
  query: string,
): Promise<ActionResult<UserSearchResultDTO[]>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    return searchUsersForFriends(user.id, query);
  }, dict.errors.friendAction);
}

export async function sendFriendRequestAction(
  targetUserId: string,
): Promise<ActionResult<{ status: "PENDING" | "ACCEPTED"; friendshipId: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const res = await sendFriendRequest(user.id, { targetUserId });
    revalidateSocialPaths(user.username);
    return res;
  }, dict.errors.friendAction);
}

export async function acceptFriendRequestAction(
  targetUserId: string,
): Promise<ActionResult<{ friendshipId: string }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const res = await acceptFriendRequest(user.id, { targetUserId });
    revalidateSocialPaths(user.username);
    return res;
  }, dict.errors.friendAction);
}

export async function removeOrRejectFriendAction(
  targetUserId: string,
): Promise<ActionResult<{ removed: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    await removeOrRejectFriendship(user.id, { targetUserId });
    revalidateSocialPaths(user.username);
    return { removed: true };
  }, dict.errors.friendAction);
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ActionResult<{ read: true }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    await markNotificationRead(user.id, { notificationId });
    revalidatePath("/notifications");
    revalidatePath("/");
    return { read: true };
  }, dict.errors.notificationAction);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  const { dict } = await getServerDictionary();
  return runAction(async () => {
    const user = await requireActionUser();
    const count = await markAllNotificationsRead(user.id);
    revalidatePath("/notifications");
    revalidatePath("/");
    return { count };
  }, dict.errors.notificationAction);
}
