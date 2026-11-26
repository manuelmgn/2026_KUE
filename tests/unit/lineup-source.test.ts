import { describe, expect, it, vi } from "vitest";
import {
  extractLineupFromClashfinderJson,
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
});
