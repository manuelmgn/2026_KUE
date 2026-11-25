export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  try {
    const { recoverPendingArtists } = await import("@/server/sync/queue");
    await recoverPendingArtists();
  } catch {
    // Database might not be initialized yet during initial container setup
  }
}
