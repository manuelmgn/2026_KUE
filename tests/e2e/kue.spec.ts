import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const E2E_DB_URL = `file:${path.resolve(import.meta.dirname, "../../prisma/e2e.db")}`;

function createTestDb() {
  const adapter = new PrismaBetterSqlite3({ url: E2E_DB_URL });
  return new PrismaClient({ adapter });
}

test.describe("KUE E2E multi-user, editions, and core flows", () => {
  test("enforces auth, registers first admin, imports lineup, triages, shares catalog editions with second user, and manages users in /admin", async ({
    page,
    browser,
  }) => {
    // 0. Unauthenticated user is redirected to /login (no "Crear conta" link shown)
    await page.goto("/import");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("html")).toHaveAttribute("lang", "gl");
    await expect(page.getByRole("link", { name: /Crear conta/i })).toBeHidden();
    await expect(
      page.getByText("Rexistro exclusivo mediante ligazón de invitación."),
    ).toBeVisible();

    // Register first user -> automatically ADMIN
    await page.goto("/register");
    await page.getByLabel("Usuario").fill("admin_kue");
    await page.getByLabel("Correo electrónico").fill("admin@kue.test");
    await page.getByLabel("Contrasinal", { exact: true }).fill("AdminPass1234!");
    await page.getByLabel("Confirmar contrasinal").fill("AdminPass1234!");
    await page.getByRole("button", { name: "Crear conta" }).click();
    await expect(page).toHaveURL(/\/$/);

    // 1. Import raw text, create festival via Places API + date pickers, verify preview, and save
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

    await page.goto("/festivals");
    await page
      .getByRole("button", { name: /\+ Crear novo festival/i })
      .first()
      .click();

    await page.getByLabel("Nome do festival").fill("Rewire");
    await page.getByLabel("Localización do festival").fill("La Haya");
    await page.getByRole("option", { name: /La Haya/i }).click();
    await page.getByLabel("Data de inicio").fill("2027-04-08");
    await page.getByLabel("Data de fin").fill("2027-04-11");
    await expect(page.getByLabel("Ano do festival")).toHaveValue("2027");
    await page.getByRole("button", { name: "Crear festival" }).click();

    await expect(page.getByRole("link", { name: /Rewire 2027/i })).toBeVisible();

    await page.goto("/festivals/rewire/2027/editar");
    await page.getByRole("tab", { name: "Importar" }).click();

    const rawLineup = [
      "Mabe Fratti & Bill Orcutt | Sábado 10 | Korzo | 19:30",
      "William Basinski 'Passing the Cup of Sorrows' | Viernes 09 | Amare | 21:00",
      "BIG|BRAVE | Sábado 10 | PAARD | 23:00",
    ].join("\n");

    await page.getByLabel("Texto do cartaz en bruto").fill(rawLineup);
    await page.getByRole("button", { name: /Analizar texto/i }).click();

    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.locator("thead th")).toHaveCount(4);
    await expect(page.getByRole("columnheader", { name: "Escenario" })).toBeHidden();

    await page.getByLabel(/Engadir días e escenarios agora/i).check();
    await expect(page.getByRole("columnheader", { name: "Escenario" })).toBeVisible();
    await page.getByLabel("Escenario fila 3").fill("PAARD Main");

    await page.getByRole("button", { name: /Importar 3 entradas/i }).click();
    await expect(page.getByText(/Importadas 3 entradas/i)).toBeVisible();

    // Verify edition metadata in DB and seed two albums for Mabe Fratti
    const db = createTestDb();
    try {
      const edition = await db.festivalEdition.findUniqueOrThrow({
        where: { slug: "rewire-2027" },
      });
      expect(edition.location).toBe("La Haya");
      expect(edition.locationCountryCode).toBe("NL");
      expect(edition.startDate?.toISOString().slice(0, 10)).toBe("2027-04-08");
      expect(edition.endDate?.toISOString().slice(0, 10)).toBe("2027-04-11");

      const mabe = await db.artist.findFirstOrThrow({
        where: { normalizedName: "mabe fratti" },
      });
      const adminUser = await db.user.findUniqueOrThrow({
        where: { normalizedUsername: "admin_kue" },
      });
      await db.userArtistState.upsert({
        where: { userId_artistId: { userId: adminUser.id, artistId: mabe.id } },
        create: {
          userId: adminUser.id,
          artistId: mabe.id,
          notes: "Cello eléctrico hipnótico imprescindible",
        },
        update: { notes: "Cello eléctrico hipnótico imprescindible" },
      });
      await db.album.createMany({
        data: [
          {
            artistId: mabe.id,
            mbid: "e2e-alb-1",
            title: "Sentir que no sabes",
            releaseYear: 2024,
            releaseType: "ALBUM",
          },
          {
            artistId: mabe.id,
            mbid: "e2e-alb-2",
            title: "Se Ve Desde Aquí",
            releaseYear: 2022,
            releaseType: "ALBUM",
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
    await page.keyboard.press("5");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("4");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    const drawer = page.locator("dialog.kue-drawer[open]");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Mabe Fratti" })).toBeVisible();

    // 3. Pin the older album ("Se Ve Desde Aquí") and verify it moves to first position
    const shelfItems = drawer.locator("button:has-text('FIXAR'), button:has-text('PIN ★')");
    await expect(shelfItems).toHaveCount(2);
    await shelfItems.nth(1).click();
    await expect(drawer.getByRole("button", { name: "PIN ★" })).toBeVisible();
    const firstAlbumTitle = drawer.locator(".font-sans.font-semibold").first();
    await expect(firstAlbumTitle).toHaveText("Se Ve Desde Aquí");

    await drawer.getByRole("tab", { name: "Bill Orcutt" }).click();
    await expect(drawer.getByRole("heading", { name: "Bill Orcutt" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // 4. Mobile viewport (390x844) Festival Mode filtering
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/festival-mode?festival=rewire-2027");

    const listItems = page.locator("ul[aria-label='Lista de actuacións na axenda'] li");
    await expect(listItems).toHaveCount(2);
    await page.getByRole("tab", { name: "Sábado 10" }).click();
    await expect(listItems).toHaveCount(1);
    await page.getByRole("button", { name: /Imprescindibles/i }).click();
    await expect(listItems).toHaveCount(2);

    // 5. Second user cannot register without an invite; admin generates a 1-use/24h invite link,
    //    second user registers with it, adds Rewire 2027 from shared catalog,
    //    and creates Rewire 2026 edition without recreating Rewire
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();

    await secondPage.goto("/login");
    await expect(
      secondPage.getByText("Rexistro exclusivo mediante ligazón de invitación."),
    ).toBeVisible();
    await expect(secondPage.getByRole("link", { name: /Crear conta/i })).toBeHidden();

    await secondPage.goto("/register");
    await expect(secondPage.getByText("Rexistro por invitación")).toBeVisible();
    await expect(secondPage.getByRole("heading", { name: /Crear conta/i })).toBeHidden();
    await expect(secondPage.getByRole("button", { name: "Crear conta" })).toBeHidden();

    // Admin generates an invitation link in /admin
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");
    await page.getByRole("tab", { name: /Invitacións/i }).click();
    await expect(page.getByLabel("Usos permitidos")).toHaveValue("2");
    await expect(page.getByLabel("Duración activa")).toHaveValue("7d");
    await page.getByLabel("Usos permitidos").selectOption("1");
    await page.getByLabel("Duración activa").selectOption("24h");
    await page.getByRole("button", { name: "Xerar ligazón" }).click();

    const inviteInput = page.locator("[data-latest-invite-box] input");
    await expect(inviteInput).toBeVisible();
    const inviteUrl = await inviteInput.inputValue();
    expect(inviteUrl).toContain("/register?invite=");

    // Second user registers via the invite link
    await secondPage.goto(inviteUrl);
    await expect(secondPage.getByText(/Invitación válida · 1 de 1 uso dispoñible/i)).toBeVisible();
    await secondPage.getByLabel("Usuario").fill("listener_two");
    await secondPage.getByLabel("Correo electrónico").fill("two@kue.test");
    await secondPage.getByLabel("Contrasinal", { exact: true }).fill("ListenerPass123!");
    await secondPage.getByLabel("Confirmar contrasinal").fill("ListenerPass123!");
    await secondPage.getByRole("button", { name: "Crear conta" }).click();
    await expect(secondPage).toHaveURL(/\/$/);

    // Opening the exhausted 1-use invite link again is rejected
    const exhaustedContext = await browser.newContext();
    const exhaustedPage = await exhaustedContext.newPage();
    await exhaustedPage.goto(inviteUrl);
    await expect(exhaustedPage.getByText("Invitación esgotada")).toBeVisible();
    await expect(exhaustedPage.getByRole("button", { name: "Crear conta" })).toBeHidden();
    await exhaustedContext.close();

    // Go to Festivales -> Catalog shows Rewire 2027 ready to add with 1 click (non-admin cannot create festivals or editions)
    await secondPage.goto("/festivals");
    await expect(secondPage.getByText("Rewire")).toBeVisible();
    await expect(secondPage.getByRole("button", { name: /\+ Crear novo festival/i })).toBeHidden();
    await expect(secondPage.getByRole("button", { name: /\+ Nova edición/i })).toBeHidden();
    await secondPage.getByRole("button", { name: /2027.*Engadir/i }).click();
    await expect(secondPage.getByText(/ENGADIDO/i)).toBeVisible();

    // Admin can see creation controls and add a second edition (2026) under Rewire
    await page.goto("/festivals");
    await page.getByRole("button", { name: /\+ Engadir festival/i }).click();
    await expect(page.getByRole("button", { name: /\+ Crear novo festival/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ Nova edición/i })).toBeVisible();
    await page.getByRole("button", { name: /\+ Nova edición/i }).click();
    await page.getByLabel("Ano do festival").fill("2026");
    await page.getByRole("button", { name: "Crear edición" }).click();
    await expect(page.getByRole("link", { name: /2026.*0 ART/i })).toBeVisible();

    // Non-admin visiting /admin is redirected to /
    await secondPage.goto("/admin");
    await expect(secondPage).toHaveURL(/\/$/);

    // Seed a lastLineupSyncAt on Rewire 2027 and verify sync visibility/trigger permissions
    const dbSync = createTestDb();
    let rewireEditionId: string;
    try {
      const updatedEdition = await dbSync.festivalEdition.update({
        where: { slug: "rewire-2027" },
        data: {
          lineupSourceUrl: "https://www.rewirefestival.nl/lineup",
          lastLineupSyncAt: new Date("2026-11-26T12:00:00.000Z"),
        },
      });
      rewireEditionId = updatedEdition.id;
    } finally {
      await dbSync.$disconnect();
    }

    // Non-admin cannot see Auto-sync tab or trigger/force sync (UI + API)
    await secondPage.goto("/festivals/rewire/2027/editar");
    await expect(secondPage.getByRole("tab", { name: /Auto-sync/i })).toBeHidden();

    const nonAdminSyncRes = await secondPage.request.post(
      `/api/festivals/${rewireEditionId}/sync-lineup`,
      { data: { force: true } },
    );
    expect(nonAdminSyncRes.status()).toBe(403);
    await secondContext.close();

    // Admin can see last sync timestamp and sync trigger buttons
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/festivals/rewire/2027/editar");
    await page.getByRole("tab", { name: /Auto-sync/i }).click();
    await expect(page.getByText(/Última comprobación:/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprobar agora" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forzar análise" })).toBeVisible();

    // 6. Admin opens /admin and sees both users
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Administración" })).toBeVisible();
    await expect(page.getByText("@admin_kue")).toBeVisible();
    await expect(page.getByText("@listener_two")).toBeVisible();
  });

  test("allows switching between gl, pt-PT, and es-ES in Settings with persistence", async ({
    page,
  }) => {
    // Log in with the admin user created in the first test
    await page.goto("/login");
    await page.getByLabel("Usuario").fill("admin_kue");
    await page.getByLabel("Contrasinal").fill("AdminPass1234!");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "gl");
    await expect(page.getByRole("heading", { name: "Axustes" })).toBeVisible();

    await page.getByRole("button", { name: /Português \(Portugal\)/i }).click();
    await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");

    await page.getByRole("button", { name: /Castellano/i }).click();
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");

    await page.getByRole("button", { name: /Galego/i }).click();
    await expect(page.getByRole("heading", { name: "Axustes" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "gl");
  });
});
