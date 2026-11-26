export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  try {
    const [{ recoverPendingArtists }, { startLineupSyncScheduler }, { ensureBootstrapAdmin }] =
      await Promise.all([
        import("@/server/sync/queue"),
        import("@/server/sync/lineup-scheduler"),
        import("@/server/services/users"),
      ]);
    await ensureBootstrapAdmin();
    await recoverPendingArtists();
    startLineupSyncScheduler();
  } catch {
    // Database might not be initialized yet during initial container setup
  }
}
