import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/domain/errors";

const mockRequireActionAdmin = vi.fn();
const mockCreateFestival = vi.fn();
const mockCreateFestivalEdition = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/i18n/server", () => ({
  getServerDictionary: async () => ({
    locale: "es-ES",
    dict: {
      common: {
        invalidData: "Datos no válidos",
        unexpectedError: "Ha ocurrido un error inesperado",
      },
      errors: {
        createFestival: "No se pudo crear el festival",
        importLineup: "Error al guardar el cartel",
        updateFestival: "No se pudo actualizar el festival",
      },
    },
  }),
}));

vi.mock("@/server/auth/dal", () => ({
  requireActionAdmin: () => mockRequireActionAdmin(),
  requireActionUser: vi.fn(),
}));

vi.mock("@/server/services/festivals", () => ({
  addEditionToUserFestivals: vi.fn(),
  createFestival: (...args: unknown[]) => mockCreateFestival(...args),
  createFestivalEdition: (...args: unknown[]) => mockCreateFestivalEdition(...args),
  removeEditionFromUserFestivals: vi.fn(),
  updateFestival: vi.fn(),
}));

vi.mock("@/server/services/lineup-sync", () => ({
  applyPendingLineupDiff: vi.fn(),
  checkFestivalLineupSync: vi.fn(),
  dismissPendingLineupDiff: vi.fn(),
  updateFestivalSyncConfig: vi.fn(),
}));

import {
  applyPendingLineupDiffAction,
  createFestivalAction,
  createFestivalEditionAction,
  dismissPendingLineupDiffAction,
  updateFestivalAction,
  updateFestivalSyncConfigAction,
} from "@/actions/festival-actions";

describe("unit: festival creation server actions permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects createFestivalAction with ForbiddenError when user is not ADMIN", async () => {
    mockRequireActionAdmin.mockRejectedValue(new ForbiddenError());

    const result = await createFestivalAction({ name: "Rewire", year: 2027 });

    expect(mockRequireActionAdmin).toHaveBeenCalledTimes(1);
    expect(mockCreateFestival).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "No tienes permisos para realizar esta acción",
    });
  });

  it("rejects createFestivalEditionAction with ForbiddenError when user is not ADMIN", async () => {
    mockRequireActionAdmin.mockRejectedValue(new ForbiddenError());

    const result = await createFestivalEditionAction({
      festivalId: "fest_123",
      year: 2028,
    });

    expect(mockRequireActionAdmin).toHaveBeenCalledTimes(1);
    expect(mockCreateFestivalEdition).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "No tienes permisos para realizar esta acción",
    });
  });

  it("rejects updateFestivalAction, updateFestivalSyncConfigAction, applyPendingLineupDiffAction, and dismissPendingLineupDiffAction for non-ADMIN users", async () => {
    mockRequireActionAdmin.mockRejectedValue(new ForbiddenError());

    const r1 = await updateFestivalAction({ festivalId: "ed_1", name: "HackFest", year: 2027 });
    const r2 = await updateFestivalSyncConfigAction({
      festivalId: "ed_1",
      lineupSourceUrl: "https://example.com/lineup",
      autoSyncEnabled: true,
      autoSyncMode: "AUTO",
      syncIntervalHours: 12,
    });
    const r3 = await applyPendingLineupDiffAction({ festivalId: "ed_1" });
    const r4 = await dismissPendingLineupDiffAction("ed_1");

    expect(mockRequireActionAdmin).toHaveBeenCalledTimes(4);
    for (const res of [r1, r2, r3, r4]) {
      expect(res).toEqual({
        ok: false,
        error: "No tienes permisos para realizar esta acción",
      });
    }
  });
});
