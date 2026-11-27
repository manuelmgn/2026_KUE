import { redirect } from "next/navigation";
import { AuthForm } from "@/components/features/AuthForm";
import { getCurrentUser } from "@/server/auth/dal";
import { ensureBootstrapAdmin } from "@/server/services/users";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await ensureBootstrapAdmin();
  const [params, currentUser] = await Promise.all([searchParams, getCurrentUser()]);

  if (currentUser) {
    redirect("/");
  }

  return <AuthForm mode="login" nextPath={params.next ?? null} />;
}
