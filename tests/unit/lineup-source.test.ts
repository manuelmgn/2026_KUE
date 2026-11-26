import { describe, expect, it, vi } from "vitest";
import {
  extractEmbeddedScriptDataText,
  extractLineupFromClashfinderJson,
  extractLineupFromEmbeddedJson,
  extractLineupFromHtmlStructure,
  extractLineupFromIcal,
  extractLineupFromJsonLd,
  fetchAndExtractFestivalLineup,
  getClashfinderJsonUrl,
  htmlToCompactText,
  validateLineupSourceUrl,
} from "@/server/clients/lineup-source";

describe("lineup-source", () => {
  it("blocks private/local SSRF URLs and non-http protocols", () => {
    expect(() => validateLineupSourceUrl("http://localhost:5030/lineup")).toThrow();
    expect(() => validateLineupSourceUrl("http://127.0.0.1/lineup")).toThrow();
    expect(() => validateLineupSourceUrl("http://192.168.1.10/lineup")).toThrow();
    expect(() => validateLineupSourceUrl("file:///etc/passwd")).toThrow();
    expect(validateLineupSourceUrl("https://www.rewirefestival.nl/lineup").hostname).toBe(
      "www.rewirefestival.nl",
    );
  });

  it("converts Clashfinder page URLs to JSON data URLs and extracts events", () => {
    const jsonUrl = getClashfinderJsonUrl(new URL("https://clashfinder.com/s/rewire2027/"));
    expect(jsonUrl).toBe("https://clashfinder.com/data/event/rewire2027.json");

    const entries = extractLineupFromClashfinderJson({
      locations: [
        {
          name: "Amare",
          events: [
            { name: "Mabe Fratti & Bill Orcutt", start: "2027-04-09 21:30" },
            { name: "Tim Hecker (live AV)", start: "2027-04-09 23:00" },
          ],
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      billingName: "Mabe Fratti & Bill Orcutt",
      artistNames: ["Mabe Fratti", "Bill Orcutt"],
      day: "2027-04-09",
      stage: "Amare",
      setTime: "21:30",
    });
    expect(entries[1]).toMatchObject({
      billingName: "Tim Hecker (live AV)",
      artistNames: ["Tim Hecker"],
      subtitle: "live AV",
      stage: "Amare",
      setTime: "23:00",
    });
  });

  it("extracts performers from embedded JSON-LD without calling an LLM", async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "MusicFestival",
              "name": "Rewire 2027",
              "subEvent": [
                {
                  "@type": "MusicEvent",
                  "startDate": "2027-04-09T20:00:00+02:00",
                  "location": { "@type": "Place", "name": "Paard" },
                  "performer": [
                    { "@type": "MusicGroup", "name": "BIG|BRAVE" },
                    { "@type": "Person", "name": "Kali Malone" }
                  ]
                }
              ]
            }
          </script>
        </head>
        <body><h1>Rewire 2027</h1></body>
      </html>
    `;

    const extracted = extractLineupFromJsonLd(html);
    expect(extracted).toHaveLength(2);
    expect(extracted[0]?.billingName).toBe("BIG|BRAVE");
    expect(extracted[1]).toMatchObject({
      billingName: "Kali Malone",
      day: "2027-04-09",
      stage: "Paard",
      setTime: "20:00",
    });

    const mockFetch = vi.fn(
      async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );

    const first = await fetchAndExtractFestivalLineup("https://example.com/lineup", {
      festivalName: "Rewire",
      festivalYear: 2027,
      fetchImpl: mockFetch,
    });
    expect(first.unchanged).toBe(false);
    expect(first.method).toBe("json-ld");
    expect(first.entries).toHaveLength(2);

    // Second call with same content hash short-circuits
    const second = await fetchAndExtractFestivalLineup("https://example.com/lineup", {
      festivalName: "Rewire",
      festivalYear: 2027,
      previousContentHash: first.contentHash,
      fetchImpl: mockFetch,
    });
    expect(second.unchanged).toBe(true);
    expect(second.entries).toHaveLength(0);
  });

  it("falls back to Gemini extractor when HTML has no JSON-LD and strips scripts/styles", async () => {
    const html = `
      <html>
        <head><style>.x{color:red}</style><script>console.log("noise")</script></head>
        <body>
          <main>
            <h1>Lineup 2027</h1>
            <ul><li>Autechre</li><li>Mabe Fratti</li></ul>
          </main>
        </body>
      </html>
    `;
    expect(htmlToCompactText(html)).not.toContain("console.log");
    expect(htmlToCompactText(html)).toContain("Autechre");

    const llmExtractor = vi.fn(async () => [
      {
        billingName: "Autechre",
        artistNames: ["Autechre"],
        subtitle: null,
        day: null,
        stage: null,
        setTime: null,
      },
    ]);

    const result = await fetchAndExtractFestivalLineup("https://example.com/lineup", {
      festivalName: "Rewire",
      festivalYear: 2027,
      geminiApiKey: "test-key",
      fetchImpl: async () =>
        new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
      llmExtractor,
    });

    expect(result.method).toBe("gemini");
    expect(result.entries).toHaveLength(1);
    expect(llmExtractor).toHaveBeenCalledTimes(1);
  });

  it("decodes hex HTML entities safely and ignores out-of-range code points", () => {
    const html = "<p>Sun O&#x27;Brien &amp; Co &#x26; &#99999999; &#x2014; Live</p>";
    const text = htmlToCompactText(html);
    expect(text).toContain("Sun O'Brien & Co &");
    expect(text).toContain("— Live");
  });

  it("blocks SSRF redirects to private addresses and handles malformed Clashfinder JSON", async () => {
    expect(() => validateLineupSourceUrl("http://[::ffff:127.0.0.1]/lineup")).toThrow();
    expect(() => validateLineupSourceUrl("http://100.64.0.1/lineup")).toThrow();

    const redirectedResponse = new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    Object.defineProperty(redirectedResponse, "url", {
      value: "http://127.0.0.1:5030/secret",
    });

    await expect(
      fetchAndExtractFestivalLineup("https://example.com/lineup.txt", {
        festivalName: "Test",
        festivalYear: 2027,
        fetchImpl: async () => redirectedResponse,
      }),
    ).rejects.toThrow("direcciones privadas o locales");

    await expect(
      fetchAndExtractFestivalLineup("https://clashfinder.com/s/testfest/", {
        festivalName: "Test",
        festivalYear: 2027,
        fetchImpl: async () =>
          new Response("{not-valid-json", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      }),
    ).rejects.toThrow("JSON inválido");
  });

  it("extracts embedded Vue/Next.js JSON and Nuxt IIFE script payloads without executing JS", async () => {
    const vueHtml = `
      <html>
        <body><nav>Home Artists Schedule</nav></body>
        <script>
          var vueJsData = {
            "artist": {
              "i1": {
                "header": "Artists",
                "items": [
                  { "title": "Kali Malone", "subtitle": "Music", "media": { "image": "https://cdn.example.com/a.jpg" } },
                  { "title": "Actress", "subtitle": "Live AV" }
                ]
              }
            },
            "menu": [{ "title": "Should be ignored" }]
          };
        </script>
      </html>
    `;
    const vueExtracted = extractEmbeddedScriptDataText(vueHtml);
    expect(vueExtracted).toContain("Kali Malone");
    expect(vueExtracted).toContain("Actress");
    expect(vueExtracted).not.toContain("Should be ignored");
    expect(vueExtracted).not.toContain("cdn.example.com");

    const nuxtHtml = `
      <html>
        <body><p>no results</p></body>
        <script>
          window.__NUXT__=(function(a,b,c){return {data:[{lineup:[
            {artist:{data:{date_tag:a,title:"Aaron Dilloway"}}},
            {artist:{data:{date_tag:b,title:"Abdullah Miniawy Trio"}}}
          ]}]}}("Fri 10 April","Sat 11 April","unused"));
        </script>
      </html>
    `;
    const nuxtExtracted = extractEmbeddedScriptDataText(nuxtHtml);
    expect(nuxtExtracted).toContain("title: Aaron Dilloway");
    expect(nuxtExtracted).toContain("date_tag: Fri 10 April");
    expect(nuxtExtracted).toContain("title: Abdullah Miniawy Trio");
    expect(nuxtExtracted).toContain("date_tag: Sat 11 April");

    const nextHtml = `
      <html>
        <body><div id="__next"></div></body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"lineup":[{"name":"Mabe Fratti","stage":"Main","day":"Friday"},{"name":"Tim Hecker","stage":"Club","day":"Saturday"}]}}}
        </script>
      </html>
    `;
    const llmExtractor = vi.fn(async ({ text }) => {
      expect(text).toContain("Mabe Fratti");
      expect(text).toContain("Tim Hecker");
      return [
        {
          billingName: "Mabe Fratti",
          artistNames: ["Mabe Fratti"],
          subtitle: null,
          day: "Friday",
          stage: "Main",
          setTime: null,
        },
      ];
    });
    const result = await fetchAndExtractFestivalLineup("https://example.com/next-lineup", {
      festivalName: "Test Fest",
      festivalYear: 2027,
      geminiApiKey: "test-key",
      fetchImpl: async () =>
        new Response(nextHtml, { status: 200, headers: { "content-type": "text/html" } }),
      llmExtractor,
    });
    expect(result.entries).toHaveLength(1);
    expect(llmExtractor).toHaveBeenCalledTimes(1);
  });

  it("retries once on transient network errors and surfaces the underlying cause on failure", async () => {
    let attempts = 0;
    const flakyFetch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new TypeError("fetch failed");
        (err as Error & { cause?: unknown }).cause = { code: "ECONNRESET" };
        throw err;
      }
      return new Response("Autechre\nKali Malone\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });

    const recovered = await fetchAndExtractFestivalLineup("https://example.com/lineup.txt", {
      festivalName: "Test",
      festivalYear: 2027,
      fetchImpl: flakyFetch,
    });
    expect(attempts).toBe(2);
    expect(recovered.entries).toHaveLength(2);

    const brokenFetch = vi.fn(async () => {
      const err = new TypeError("fetch failed");
      (err as Error & { cause?: unknown }).cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      throw err;
    });
    await expect(
      fetchAndExtractFestivalLineup("https://example.com/down.txt", {
        festivalName: "Test",
        festivalYear: 2027,
        fetchImpl: brokenFetch,
      }),
    ).rejects.toThrow("UND_ERR_CONNECT_TIMEOUT");
  });

  it("extracts Primavera Sound deeply nested window.__INITIAL_DATA__ LineupList deterministically", async () => {
    const primaveraHtml = `
      <html>
        <body><div id="root"></div></body>
        <script type="abc123-text/javascript">
          window.__INITIAL_DATA__ = {
            "components": [
              { "type": "HeaderRedesignHeader", "name": "header" },
              {
                "type": "Body",
                "components": [
                  {
                    "type": "LineupList",
                    "artistSets": [],
                    "blocks": [
                      {
                        "id": "blk_1",
                        "title": { "en": "10 JUN", "pt": "10 JUN" },
                        "artists": [
                          { "artistName": "Fontaines D.C.", "level": "headliner" },
                          { "artistName": "Bonnie \\"Prince\\" Billy", "level": "semi" }
                        ]
                      },
                      {
                        "id": "blk_2",
                        "title": { "en": "13 JUN · PRIMAVERA BITS" },
                        "artists": [
                          { "artistName": "Josh Baker", "level": "normal" }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          };
        </script>
      </html>
    `;

    // Embedded script text pruning must preserve deep artistName values (depth > 8)
    const embeddedText = extractEmbeddedScriptDataText(primaveraHtml);
    expect(embeddedText).toContain("Fontaines D.C.");
    expect(embeddedText).toContain("Josh Baker");

    const extracted = extractLineupFromEmbeddedJson(primaveraHtml);
    expect(extracted).toHaveLength(3);
    expect(extracted[0]).toMatchObject({
      billingName: "Fontaines D.C.",
      day: "10 JUN",
      stage: null,
    });
    expect(extracted[2]).toMatchObject({
      billingName: "Josh Baker",
      day: "13 JUN",
      stage: "PRIMAVERA BITS",
    });

    const result = await fetchAndExtractFestivalLineup(
      "https://www.primaverasound.com/en/porto/lineup-porto",
      {
        festivalName: "Primavera Sound Porto",
        festivalYear: 2027,
        fetchImpl: async () =>
          new Response(primaveraHtml, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      },
    );
    expect(result.method).toBe("embedded-json");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts iCalendar (.ics) feeds deterministically without AI", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "SUMMARY:Tim Hecker (live AV)",
      "DTSTART:20270409T213000Z",
      "LOCATION:Amare",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Mabe Fratti &",
      "  Bill Orcutt",
      "DTSTART:20270410T200000Z",
      "LOCATION:Paard",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsed = extractLineupFromIcal(ics);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      billingName: "Tim Hecker (live AV)",
      day: "2027-04-09",
      setTime: "21:30",
      stage: "Amare",
    });
    expect(parsed[1]).toMatchObject({
      billingName: "Mabe Fratti & Bill Orcutt",
      artistNames: ["Mabe Fratti", "Bill Orcutt"],
      day: "2027-04-10",
      setTime: "20:00",
      stage: "Paard",
    });

    const result = await fetchAndExtractFestivalLineup("https://example.com/schedule.ics", {
      festivalName: "Rewire",
      festivalYear: 2027,
      fetchImpl: async () =>
        new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } }),
    });
    expect(result.method).toBe("ical");
    expect(result.entries).toHaveLength(2);
  });

  it("extracts Vue/Nuxt embedded lineups and HTML artist cards deterministically without calling Gemini", async () => {
    const vueHtml = `
      <html>
        <body><nav>Home Artists</nav></body>
        <script>
          var vueJsData = {
            "artist": {
              "i1": {
                "items": [
                  { "title": "*07", "subtitle": "Music" },
                  { "title": "96 Back", "subtitle": "Music" },
                  { "title": "ABADIR", "subtitle": "Live AV" },
                  { "title": "Panel Talk", "subtitle": "Discourse" }
                ]
              }
            }
          };
        </script>
      </html>
    `;
    const vueEntries = extractLineupFromEmbeddedJson(vueHtml);
    expect(vueEntries.map((e) => e.billingName)).toEqual(["*07", "96 Back", "ABADIR"]);

    const nuxtHtml = `
      <html><body><p>no results</p></body>
      <script>
        window.__NUXT__=(function(a,b,c){return {data:[{lineup:[
          {artist:{uid:"aaron-dilloway",data:{date_tag:a,title:"Aaron Dilloway"}}},
          {artist:{uid:"film-krakatoa",data:{date_tag:b,title:"Krakatoa"}}},
          {artist:{uid:"acopia",data:{date_tag:b,title:"Acopia"}}}
        ]}]}}("Fri 10 April","Sat 11 April","unused"));
      </script></html>
    `;
    const nuxtEntries = extractLineupFromEmbeddedJson(nuxtHtml);
    expect(nuxtEntries.map((e) => e.billingName)).toEqual(["Aaron Dilloway", "Acopia"]);
    expect(nuxtEntries[0]?.day).toBe("Fri 10 April");

    const artistCardsHtml = `
      <html>
        <body>
          <nav><a href="/en/2026/artists/nav-link">Nav</a></nav>
          <main>
            <a href="/en/2026/artists/k-means"><span>Music</span><p>K Means</p></a>
            <a href="/en/2026/artists/2k88"><span>Music</span><p>2K88</p></a>
            <a href="/en/2026/artists/actress"><span>Music</span><p>Actress</p></a>
            <a href="/en/2026/artists/arca"><span>Music</span><p>Arca</p></a>
            <a href="/en/2026/artists/beatrice-m"><span>Music</span><p>Beatrice M</p></a>
            <a href="/en/2026/artists/panel-speaker"><span>Discourse</span><p>Panel Speaker</p></a>
          </main>
        </body>
      </html>
    `;
    const htmlEntries = extractLineupFromHtmlStructure(
      artistCardsHtml,
      "https://www.unsound.pl/en/2026/artists",
    );
    expect(htmlEntries.map((e) => e.billingName)).toEqual([
      "K Means",
      "2K88",
      "Actress",
      "Arca",
      "Beatrice M",
    ]);

    const llmExtractor = vi.fn();
    const res = await fetchAndExtractFestivalLineup("https://www.unsound.pl/en/2026/artists", {
      festivalName: "Unsound",
      festivalYear: 2026,
      fetchImpl: async () =>
        new Response(artistCardsHtml, { status: 200, headers: { "content-type": "text/html" } }),
      llmExtractor,
    });
    expect(res.method).toBe("html-structured");
    expect(res.entries).toHaveLength(5);
    expect(llmExtractor).not.toHaveBeenCalled();
  });
});
