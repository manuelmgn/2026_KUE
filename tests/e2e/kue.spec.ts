import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const E2E_DB_URL = `file:${path.resolve(import.meta.dirname, "../../prisma/e2e.db")}`;

function createTestDb() {
  const adapter = new PrismaBetterSqlite3({ url: E2E_DB_URL });
  return new PrismaClient({ adapter });
}

test.describe("KUE E2E flows", () => {
  test("imports raw lineup with collaboration & subtitle, edits preview, triages by keyboard, switches collab & pins album, and uses Festival Mode on mobile", async ({
    page,
  }) => {
    // 1. Import raw text, create festival via Places API + date pickers, verify artists-only preview, toggle schedule, and save
    await page.route("**/api/places*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          places: [
            {
              placeId: "2747373",
              name: "La Haya",
              province: "Gemeente Den Haag",
              region: "Holanda Meridional",
              country: "Países Bajos",
              countryCode: "NL",
              latitude: 52.07667,
              longitude: 4.29861,
            },
          ],
        }),
      });
    });

    await page.goto("/import");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");

    await page.getByLabel("Nome do festival").fill("Rewire");
    await page.getByLabel("Localização do festival").fill("La Haya");
    await page.getByRole("option", { name: /La Haya/i }).click();
    await page.getByLabel("Data de início").fill("2027-04-08");
    await page.getByLabel("Data de fim").fill("2027-04-11");
    await expect(page.getByLabel("Ano do festival")).toHaveValue("2027");
    await page.getByRole("button", { name: "Criar" }).click();

    await expect(page.getByLabel("Festival de destino")).toBeVisible();

    const rawLineup = [
      "Mabe Fratti & Bill Orcutt | Sábado 10 | Korzo | 19:30",
      "William Basinski 'Passing the Cup of Sorrows' | Viernes 09 | Amare | 21:00",
      "BIG|BRAVE | Sábado 10 | PAARD | 23:00",
    ].join("\n");

    await page.getByLabel("Texto do cartaz em bruto").fill(rawLineup);
    await page.getByRole("button", { name: /Analisar texto/i }).click();

    // Verify preview shows only artists initially (no Dia / Palco columns until toggled)
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.locator("thead th")).toHaveCount(4);
    await expect(page.getByRole("columnheader", { name: "Palco" })).toBeHidden();

    // Optionally reveal schedule columns and edit stage on BIG|BRAVE row
    await page.getByLabel(/Adicionar dias e palcos agora/i).check();
    await expect(page.getByRole("columnheader", { name: "Palco" })).toBeVisible();
    await page.getByLabel("Palco linha 3").fill("PAARD Main");

    await page.getByRole("button", { name: /Importar 3 entradas/i }).click();
    await expect(page.getByText(/Importadas 3 entradas/i)).toBeVisible();

    // Verify location metadata and dates were persisted in DB, and seed two albums for Mabe Fratti
    const db = createTestDb();
    try {
      const festival = await db.festival.findUniqueOrThrow({ where: { slug: "rewire-2027" } });
      expect(festival.location).toBe("La Haya");
      expect(festival.locationProvince).toBe("Gemeente Den Haag");
      expect(festival.locationRegion).toBe("Holanda Meridional");
      expect(festival.locationCountry).toBe("Países Bajos");
      expect(festival.locationCountryCode).toBe("NL");
      expect(festival.startDate?.toISOString().slice(0, 10)).toBe("2027-04-08");
      expect(festival.endDate?.toISOString().slice(0, 10)).toBe("2027-04-11");

      const mabe = await db.artist.findFirstOrThrow({
        where: { normalizedName: "mabe fratti" },
      });
      await db.artist.update({
        where: { id: mabe.id },
        data: { notes: "Cello eléctrico hipnótico imprescindible" },
      });
      await db.album.createMany({
        data: [
          {
            artistId: mabe.id,
            mbid: "e2e-alb-1",
            title: "Sentir que no sabes",
            releaseYear: 2024,
            releaseType: "ALBUM",
            isPinned: false,
          },
          {
            artistId: mabe.id,
            mbid: "e2e-alb-2",
            title: "Se Ve Desde Aquí",
            releaseYear: 2022,
            releaseType: "ALBUM",
            isPinned: false,
          },
        ],
      });
    } finally {
      await db.$disconnect();
    }

    // 2. Navigate to lineup, switch to ÍNDICE, and perform keyboard triage (↓, 5, Enter)
    await page.getByRole("link", { name: /Ver cartaz/i }).click();
    await expect(page.getByRole("heading", { name: /REWIRE 2027/i })).toBeVisible();

    await page.getByRole("button", { name: "ÍNDICE" }).click();

    // First row is Mabe Fratti & Bill Orcutt -> rate 5 with keyboard
    await page.keyboard.press("5");
    // Move down to William Basinski -> rate 4 with keyboard
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("4");
    // Move back up to Mabe Fratti & Bill Orcutt and press Enter to open ArtistDrawer
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    const drawer = page.locator("dialog.kue-drawer[open]");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Mabe Fratti" })).toBeVisible();

    // 3. Pin the older album ("Se Ve Desde Aquí") and verify it moves to first position
    const shelfItems = drawer.locator("button:has-text('FIXAR'), button:has-text('PIN ★')");
    await expect(shelfItems).toHaveCount(2);
    // Second album is "Se Ve Desde Aquí" (2022) before pinning
    await shelfItems.nth(1).click();
    await expect(drawer.getByRole("button", { name: "PIN ★" })).toBeVisible();
    const firstAlbumTitle = drawer.locator(".font-sans.font-semibold").first();
    await expect(firstAlbumTitle).toHaveText("Se Ve Desde Aquí");

    // Switch collaboration tab to Bill Orcutt
    await drawer.getByRole("tab", { name: "Bill Orcutt" }).click();
    await expect(drawer.getByRole("heading", { name: "Bill Orcutt" })).toBeVisible();

    // Close drawer via Escape
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // 4. Mobile viewport (390x844) Festival Mode filtering by day & must-see (>=4)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/festival-mode?festival=rewire-2027");

    // Must-see is active by default: Mabe Fratti & Bill Orcutt (5/5) + William Basinski (4/5), NOT BIG|BRAVE (unrated)
    const listItems = page.locator("ul[aria-label='Lista de atuações no Modo Festival'] li");
    await expect(listItems).toHaveCount(2);
    await expect(page.getByText("Mabe Fratti & Bill Orcutt")).toBeVisible();
    await expect(page.getByText("William Basinski 'Passing the Cup of Sorrows'")).toBeVisible();
    await expect(page.getByText("BIG|BRAVE")).toBeHidden();

    // Filter by day "Sábado 10" -> only Mabe Fratti & Bill Orcutt
    await page.getByRole("tab", { name: "Sábado 10" }).click();
    await expect(listItems).toHaveCount(1);
    await expect(page.getByText("Mabe Fratti & Bill Orcutt")).toBeVisible();

    // Toggle off must-see -> BIG|BRAVE (Sábado 10) also appears
    await page.getByRole("button", { name: /Imprescindíveis/i }).click();
    await expect(listItems).toHaveCount(2);
    await expect(page.getByText("BIG|BRAVE")).toBeVisible();
  });

  test("defaults to pt-PT and allows switching language to es in Settings with persistence", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
    await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cartaz" })).toBeVisible();

    // Switch to Spanish
    await page.getByRole("button", { name: /Español/i }).click();
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cartel" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // Reload to verify server-side persistence via cookie
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cartel" })).toBeVisible();

    // Switch back to Portuguese (Portugal)
    await page.getByRole("button", { name: /Português \(Portugal\)/i }).click();
    await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cartaz" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
  });
});
