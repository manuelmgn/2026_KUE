import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getMediaContentType, resolveSafeMediaPath } from "@/server/media-storage";

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

  try {
    const fileBuffer = await readFile(safePath);
    const contentType = getMediaContentType(safePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const isNotFound =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";

    if (isNotFound) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ error: "Error leyendo el archivo" }, { status: 500 });
  }
}
