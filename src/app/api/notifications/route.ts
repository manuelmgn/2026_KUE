import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/dal";
import { listUserNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await listUserNotifications(user.id, { limit: 40 });
  return NextResponse.json(snapshot, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
