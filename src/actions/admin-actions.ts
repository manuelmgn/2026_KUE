"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, runAction } from "@/actions/result";
import type {
  AdminCreateUserInput,
  AdminDeleteUserInput,
  AdminResetPasswordInput,
  AdminUpdateUserActiveInput,
  AdminUpdateUserRoleInput,
  CreateInvitationInput,
  RevokeInvitationInput,
} from "@/domain/schemas";
import { requireActionAdmin } from "@/server/auth/dal";
import { deleteFestivalBrand, deleteFestivalEdition } from "@/server/services/festivals";
import {
  createInvitationLink,
  type InvitationLinkDTO,
  revokeInvitationLink,
} from "@/server/services/invitations";
import {
  adminCreateUser,
  adminDeleteUser,
  adminResetUserPassword,
  adminSetUserActive,
  adminSetUserRole,
  type PublicUserDTO,
} from "@/server/services/users";

export async function adminCreateInvitationAction(
  input: CreateInvitationInput,
): Promise<ActionResult<InvitationLinkDTO>> {
  return runAction(async () => {
    const admin = await requireActionAdmin();
    const invitation = await createInvitationLink(admin.id, input);
    revalidatePath("/admin");
    return invitation;
  });
}

export async function adminRevokeInvitationAction(
  input: RevokeInvitationInput,
): Promise<ActionResult<InvitationLinkDTO>> {
  return runAction(async () => {
    await requireActionAdmin();
    const invitation = await revokeInvitationLink(input);
    revalidatePath("/admin");
    return invitation;
  });
}

export async function adminCreateUserAction(
  input: AdminCreateUserInput,
): Promise<ActionResult<PublicUserDTO>> {
  return runAction(async () => {
    await requireActionAdmin();
    const user = await adminCreateUser(input);
    revalidatePath("/admin");
    return user;
  });
}

export async function adminSetUserRoleAction(
  input: AdminUpdateUserRoleInput,
): Promise<ActionResult<PublicUserDTO>> {
  return runAction(async () => {
    const admin = await requireActionAdmin();
    const user = await adminSetUserRole(admin.id, input);
    revalidatePath("/admin");
    return user;
  });
}

export async function adminSetUserActiveAction(
  input: AdminUpdateUserActiveInput,
): Promise<ActionResult<PublicUserDTO>> {
  return runAction(async () => {
    const admin = await requireActionAdmin();
    const user = await adminSetUserActive(admin.id, input);
    revalidatePath("/admin");
    return user;
  });
}

export async function adminResetPasswordAction(
  input: AdminResetPasswordInput,
): Promise<ActionResult<{ reset: true }>> {
  return runAction(async () => {
    await requireActionAdmin();
    await adminResetUserPassword(input);
    revalidatePath("/admin");
    return { reset: true };
  });
}

export async function adminDeleteUserAction(
  input: AdminDeleteUserInput,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    const admin = await requireActionAdmin();
    await adminDeleteUser(admin.id, input);
    revalidatePath("/admin");
    return { deleted: true };
  });
}

export async function adminDeleteEditionAction(
  editionId: string,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireActionAdmin();
    await deleteFestivalEdition(editionId);
    revalidatePath("/", "layout");
    revalidatePath("/admin");
    revalidatePath("/festivals");
    revalidatePath("/lineup");
    revalidatePath("/manage");
    return { deleted: true };
  });
}

export async function adminDeleteFestivalAction(
  festivalId: string,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireActionAdmin();
    await deleteFestivalBrand(festivalId);
    revalidatePath("/", "layout");
    revalidatePath("/admin");
    revalidatePath("/festivals");
    revalidatePath("/lineup");
    revalidatePath("/manage");
    return { deleted: true };
  });
}
