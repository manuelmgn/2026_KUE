import { redirect } from "next/navigation";
import { AuthForm } from "@/components/features/AuthForm";
import { getCurrentUser } from "@/server/auth/dal";
import { isBootstrapAdminConfigured } from "@/server/env";
import { validateInvitationToken } from "@/server/services/invitations";
import { ensureBootstrapAdmin, hasAnyUsers } from "@/server/services/users";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams: Promise<{ next?: string; invite?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  await ensureBootstrapAdmin();
  const [params, currentUser, anyUsers] = await Promise.all([
    searchParams,
    getCurrentUser(),
    hasAnyUsers(),
  ]);

  if (currentUser) {
    redirect("/");
  }

  const allowFirstUserRegistration = !anyUsers && !isBootstrapAdminConfigured();
  const inviteToken = params.invite?.trim() || null;
  const inviteState = allowFirstUserRegistration
    ? null
    : await validateInvitationToken(inviteToken);

  return (
    <AuthForm
      mode="register"
      isFirstUser={allowFirstUserRegistration}
      inviteToken={inviteToken}
      inviteState={inviteState}
      nextPath={params.next ?? null}
    />
  );
}
