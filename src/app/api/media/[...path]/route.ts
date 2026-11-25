import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getServableMediaType, resolveSafeMediaPath } from "@/server/media-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Ruta de medio inválida" }, { status: 400 });
  }

  const relativePath = segments.join("/");
  const safePath = resolveSafeMediaPath(relativePath);
  if (!safePath) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 400 });
  }

  // Only cached images are ever served (never `.tmp` leftovers or any other file type).
  const contentType = getServableMediaType(safePath);
  if (!contentType) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  try {
    const fileBuffer = await readFile(safePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.byteLength),
        // File names are content-hashed, so the same URL always maps to the same bytes.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "EISDIR") {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ error: "Error leyendo el archivo" }, { status: 500 });
  }
}
