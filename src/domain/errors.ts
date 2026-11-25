/**
 * Expected, user-facing business error (e.g. "artist not found", "MBID already linked").
 * Its message is safe to show in the UI; any other error is reported as a generic failure.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
