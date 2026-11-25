/**
 * Maps a relative media path stored in the database (e.g. `artists/abc-1f2e3d.jpg`) to the
 * internal `/api/media/...` endpoint. Pure and framework-free so client components can use it.
 */
export function toMediaApiUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) {
    return null;
  }
  const clean = relativePath.replace(/^\/+/, "");
  return clean ? `/api/media/${clean}` : null;
}
