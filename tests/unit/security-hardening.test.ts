import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError, ForbiddenError } from "@/domain/errors";
import type { PrismaClient } from "@/generated/prisma/client";
import { fetchAndExtractFestivalLineup, isPrivateIpAddress } from "@/server/clients/lineup-source";
import { cleanEnvString, isBootstrapAdminConfigured, readBootstrapAdminEnv } from "@/server/env";
import { updateEntrySchedule } from "@/server/services/entries";

const mockRequireActionAdmin = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
        importLineup: "Error al guardar el cartel",
        disambiguateArtist: "Error al reasignar el artista",
      },
    },
  }),
}));

vi.mock("@/server/auth/dal", () => ({
  requireActionAdmin: () => mockRequireActionAdmin(),
  requireActionUser: vi.fn(),
}));

vi.mock("@/server/services/importer", () => ({
  importFestivalLineup: vi.fn(),
}));

vi.mock("@/server/services/artists", () => ({
  disambiguateArtist: vi.fn(),
  getArtistDetail: vi.fn(),
  searchCatalogArtists: vi.fn(),
  updateAlbumCustomUrl: vi.fn(),
  updateAlbumPin: vi.fn(),
  updateArtistNotes: vi.fn(),
  updateArtistRating: vi.fn(),
  updateArtistStatus: vi.fn(),
}));

import { disambiguateArtistAction } from "@/actions/artist-actions";
import { importLineupAction } from "@/actions/import-actions";

describe("unit: security hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks non-ADMIN users from importLineupAction and disambiguateArtistAction", async () => {
    mockRequireActionAdmin.mockRejectedValue(new ForbiddenError());

    const importRes = await importLineupAction({
      festivalId: "ed_1",
      rows: [
        {
          billingName: "Artist",
          artistNames: ["Artist"],
          subtitle: null,
          day: null,
          stage: null,
          setTime: null,
          included: true,
        },
      ],
    });
    const disambiguateRes = await disambiguateArtistAction({
      artistId: "art_1",
      mbid: "11111111-1111-4111-8111-111111111111",
    });

    expect(mockRequireActionAdmin).toHaveBeenCalledTimes(2);
    expect(importRes).toEqual({
      ok: false,
      error: "No tienes permisos para realizar esta acción",
    });
    expect(disambiguateRes).toEqual({
      ok: false,
      error: "No tienes permisos para realizar esta acción",
    });
  });

  it("rejects shared schedule modifications when allowSharedSchedule is false while allowing personal live reviews", async () => {
    const festivalEntryUpdate = vi.fn();
    const userEntryStateUpsert = vi.fn().mockResolvedValue({
      liveRating: 4,
      liveNotes: "Great live set",
    });
    const mockDb = {
      festivalEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "entry_1",
          day: "Friday",
          stage: "Main",
          setTime: "21:00",
        }),
        update: festivalEntryUpdate,
      },
      userEntryState: {
        upsert: userEntryStateUpsert,
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    await expect(
      updateEntrySchedule(
        "user_1",
        { entryId: "entry_1", day: "Saturday", liveRating: 4 },
        mockDb,
        { allowSharedSchedule: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(festivalEntryUpdate).not.toHaveBeenCalled();

    const okResult = await updateEntrySchedule(
      "user_1",
      { entryId: "entry_1", liveRating: 4, liveNotes: "Great live set" },
      mockDb,
      { allowSharedSchedule: false },
    );
    expect(okResult).toEqual({
      id: "entry_1",
      day: "Friday",
      stage: "Main",
      setTime: "21:00",
      liveRating: 4,
      liveNotes: "Great live set",
    });
    expect(festivalEntryUpdate).not.toHaveBeenCalled();
    expect(userEntryStateUpsert).toHaveBeenCalledTimes(1);
  });

  it("identifies private/internal IPv4 and IPv6 addresses and blocks SSRF redirects", async () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.0.0.5")).toBe(true);
    expect(isPrivateIpAddress("172.16.4.1")).toBe(true);
    expect(isPrivateIpAddress("192.168.1.20")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("::1")).toBe(true);
    expect(isPrivateIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("fe80::1")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
    expect(isPrivateIpAddress("1.1.1.1")).toBe(false);

    const redirectFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );

    await expect(
      fetchAndExtractFestivalLineup("https://festival.example.com/lineup", {
        festivalName: "Test",
        festivalYear: 2026,
        force: true,
        fetchImpl: redirectFetch,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(redirectFetch).toHaveBeenCalledTimes(1);
  });

  it("strips accidental quotes from env strings and detects bootstrap admin config", () => {
    expect(cleanEnvString(' "admin" ')).toBe("admin");
    expect(cleanEnvString("'secret123'")).toBe("secret123");
    expect(cleanEnvString(' "" ')).toBeUndefined();

    const prevUser = process.env.ADMIN_USERNAME;
    const prevEmail = process.env.ADMIN_EMAIL;
    const prevPass = process.env.ADMIN_PASSWORD;

    try {
      process.env.ADMIN_USERNAME = '"admin"';
      process.env.ADMIN_EMAIL = '"admin@example.com"';
      process.env.ADMIN_PASSWORD = '"supersecret123"';

      expect(isBootstrapAdminConfigured()).toBe(true);
      expect(readBootstrapAdminEnv()).toEqual({
        username: "admin",
        email: "admin@example.com",
        password: "supersecret123",
        partiallyConfigured: false,
      });

      delete process.env.ADMIN_PASSWORD;
      expect(isBootstrapAdminConfigured()).toBe(false);
      expect(readBootstrapAdminEnv().partiallyConfigured).toBe(true);
    } finally {
      if (prevUser === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = prevUser;

      if (prevEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prevEmail;

      if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prevPass;
    }
  });
});
