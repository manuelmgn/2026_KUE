import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getCurrentUser } from "@/server/auth/dal";
import { extractClientIp } from "@/server/auth/rate-limit";
import { MAX_AVATAR_INPUT_BYTES } from "@/server/media-storage";
import { removeOwnAvatar, uploadOwnAvatar } from "@/server/services/profile";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_INPUT_BYTES + 128 * 1024) {
    return NextResponse.json(
      { error: "La imagen supera el tamaño máximo permitido (4 MB)" },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud multipart no válida" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecciona un archivo de imagen" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera el tamaño máximo permitido (4 MB)" },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ipAddress = extractClientIp(request.headers);
    const result = await uploadOwnAvatar(user.id, buffer, { ipAddress });

    revalidatePath("/", "layout");
    revalidatePath("/settings");
    revalidatePath("/social");
    revalidatePath(`/u/${encodeURIComponent(user.username)}`);

    return NextResponse.json({ avatarPath: result.avatarPath }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo actualizar el avatar" }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await removeOwnAvatar(user.id);
    revalidatePath("/", "layout");
    revalidatePath("/settings");
    revalidatePath("/social");
    revalidatePath(`/u/${encodeURIComponent(user.username)}`);
    return NextResponse.json({ avatarPath: null }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo eliminar el avatar" }, { status: 500 });
  }
}
