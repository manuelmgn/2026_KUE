import { redirect } from "next/navigation";
import { AuthForm } from "@/components/features/AuthForm";
import { getCurrentUser } from "@/server/auth/dal";
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

  const inviteToken = params.invite?.trim() || null;
  const inviteState = anyUsers ? await validateInvitationToken(inviteToken) : null;

  return (
    <AuthForm
      mode="register"
      isFirstUser={!anyUsers}
      inviteToken={inviteToken}
      inviteState={inviteState}
      nextPath={params.next ?? null}
    />
  );
}
