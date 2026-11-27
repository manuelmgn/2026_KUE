import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/dal";
import { getServableMediaType, readMediaFile, resolveSafeMediaPath } from "@/server/media-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Ruta de medio inválida" }, { status: 400 });
  }

  const relativePath = segments.join("/");
  const safePath = resolveSafeMediaPath(relativePath);
  if (!safePath) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 400 });
  }

  const expectedType = getServableMediaType(safePath);
  if (!expectedType) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  try {
    const media = await readMediaFile(relativePath);
    if (!media) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    const headers: Record<string, string> = {
      "Content-Type": media.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (media.contentLength !== undefined) {
      headers["Content-Length"] = String(media.contentLength);
    }

    const body: BodyInit =
      media.body instanceof Uint8Array ? new Uint8Array(media.body) : media.body;

    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Error leyendo el archivo" }, { status: 500 });
  }
}
