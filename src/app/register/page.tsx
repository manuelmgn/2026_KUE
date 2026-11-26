import { redirect } from "next/navigation";
import { AuthForm } from "@/components/features/AuthForm";
import { getCurrentUser } from "@/server/auth/dal";
import { ensureBootstrapAdmin, hasAnyUsers, isRegistrationOpen } from "@/server/services/users";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  await ensureBootstrapAdmin();
  const [params, currentUser, anyUsers, registrationOpen] = await Promise.all([
    searchParams,
    getCurrentUser(),
    hasAnyUsers(),
    isRegistrationOpen(),
  ]);

  if (currentUser) {
    redirect("/");
  }

  return (
    <AuthForm
      mode="register"
      registrationOpen={registrationOpen}
      isFirstUser={!anyUsers}
      nextPath={params.next ?? null}
    />
  );
}
