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
    // 1. Import raw text, create festival, edit a row in preview, and save
    await page.goto("/import");

    await page.getByLabel("Nombre del festival").fill("Rewire");
    await page.getByLabel("Año del festival").fill("2027");
    await page.getByLabel("Ubicación del festival").fill("La Haya · 8–11 abril 2027");
    await page.getByRole("button", { name: "Crear" }).click();

    await expect(page.getByLabel("Festival de destino")).toBeVisible();

    const rawLineup = [
      "Mabe Fratti & Bill Orcutt | Sábado 10 | Korzo | 19:30",
      "William Basinski 'Passing the Cup of Sorrows' | Viernes 09 | Amare | 21:00",
      "BIG|BRAVE | Sábado 10 | PAARD | 23:00",
    ].join("\n");

    await page.getByLabel("Texto del cartel en bruto").fill(rawLineup);
    await page.getByRole("button", { name: /Analizar texto/i }).click();

    // Verify parsed preview rows and edit stage on BIG|BRAVE row
    await expect(page.locator("tbody tr")).toHaveCount(3);
    const thirdRowStage = page.locator("tbody tr").nth(2).locator("input").nth(5);
    await thirdRowStage.fill("PAARD Main");

    await page.getByRole("button", { name: /Importar 3 entradas/i }).click();
    await expect(page.getByText(/Importadas 3 entradas/i)).toBeVisible();

    // Seed two albums for Mabe Fratti so we can deterministically test discography pinning
    const db = createTestDb();
    try {
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
    await page.getByRole("link", { name: /Ver cartel/i }).click();
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
    const shelfItems = drawer.locator("button:has-text('FIJAR'), button:has-text('PIN ★')");
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
    const listItems = page.locator("ul[aria-label='Lista de pases en Modo Festival'] li");
    await expect(listItems).toHaveCount(2);
    await expect(page.getByText("Mabe Fratti & Bill Orcutt")).toBeVisible();
    await expect(page.getByText("William Basinski 'Passing the Cup of Sorrows'")).toBeVisible();
    await expect(page.getByText("BIG|BRAVE")).toBeHidden();

    // Filter by day "Sábado 10" -> only Mabe Fratti & Bill Orcutt
    await page.getByRole("tab", { name: "Sábado 10" }).click();
    await expect(listItems).toHaveCount(1);
    await expect(page.getByText("Mabe Fratti & Bill Orcutt")).toBeVisible();

    // Toggle off must-see -> BIG|BRAVE (Sábado 10) also appears
    await page.getByRole("button", { name: /Imprescindibles/i }).click();
    await expect(listItems).toHaveCount(2);
    await expect(page.getByText("BIG|BRAVE")).toBeVisible();
  });
});
