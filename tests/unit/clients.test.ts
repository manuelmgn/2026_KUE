import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { searchDeezerAlbumCover, searchDeezerArtistPhoto } from "@/server/clients/deezer";
import {
  ExternalApiError,
  fetchMusicBrainzReleaseGroups,
  MUSICBRAINZ_USER_AGENT,
  searchMusicBrainzArtists,
  setMusicBrainzMinInterval,
} from "@/server/clients/musicbrainz";
import { fetchWikipediaBio } from "@/server/clients/wikipedia";

const server = setupServer();

beforeAll(() => {
  setMusicBrainzMinInterval(0);
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("server/clients (MSW)", () => {
  it("sends mandatory User-Agent to MusicBrainz and returns top candidates without tags", async () => {
    let seenUserAgent: string | null = null;
    server.use(
      http.get("https://musicbrainz.org/ws/2/artist", ({ request }) => {
        seenUserAgent = request.headers.get("user-agent");
        return HttpResponse.json({
          artists: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Helen",
              country: "US",
              type: "Group",
              disambiguation: "Liz Harris shoegaze band",
              tags: [{ name: "shoegaze" }],
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Helen",
              country: "GB",
              type: "Person",
              disambiguation: "UK pop singer",
            },
          ],
        });
      }),
    );

    const candidates = await searchMusicBrainzArtists("Helen", 5);
    expect(seenUserAgent).toBe(MUSICBRAINZ_USER_AGENT);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Helen",
      country: "US",
      type: "Group",
      disambiguation: "Liz Harris shoegaze band",
    });
    expect("tags" in (candidates[0] ?? {})).toBe(false);
  });

  it("throws ExternalApiError on MusicBrainz 429/503 and malformed JSON", async () => {
    server.use(
      http.get(
        "https://musicbrainz.org/ws/2/artist",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(searchMusicBrainzArtists("Tim Hecker")).rejects.toBeInstanceOf(ExternalApiError);

    server.use(
      http.get("https://musicbrainz.org/ws/2/artist", () =>
        HttpResponse.json({ artists: "not-an-array" }),
      ),
    );
    await expect(searchMusicBrainzArtists("Tim Hecker")).rejects.toBeInstanceOf(ExternalApiError);
  });

  it("maps MusicBrainz release-groups and filters compilations when enough studio albums exist", async () => {
    server.use(
      http.get("https://musicbrainz.org/ws/2/release-group", () =>
        HttpResponse.json({
          "release-groups": [
            {
              id: "rg-1",
              title: "No Highs",
              "primary-type": "Album",
              "secondary-types": [],
              "first-release-date": "2023-04-07",
            },
            {
              id: "rg-2",
              title: "Virgins",
              "primary-type": "Album",
              "secondary-types": [],
              "first-release-date": "2013-10-14",
            },
            {
              id: "rg-3",
              title: "Live in Hague",
              "primary-type": "Album",
              "secondary-types": ["Live"],
              "first-release-date": "2021-01-01",
            },
            {
              id: "rg-4",
              title: "Best Of Compilation",
              "primary-type": "Album",
              "secondary-types": ["Compilation"],
              "first-release-date": "2024-01-01",
            },
          ],
        }),
      ),
    );

    const releases = await fetchMusicBrainzReleaseGroups("mbid-1");
    expect(
      releases.map((r) => ({ title: r.title, type: r.releaseType, year: r.releaseYear })),
    ).toEqual([
      { title: "No Highs", type: "ALBUM", year: 2023 },
      { title: "Live in Hague", type: "LIVE", year: 2021 },
      { title: "Virgins", type: "ALBUM", year: 2013 },
    ]);
  });

  it("fetches artist photo and album cover from Deezer and handles empty results", async () => {
    server.use(
      http.get("https://api.deezer.com/search/artist", () =>
        HttpResponse.json({
          data: [
            { id: 10, name: "Tim Hecker Tribute", picture_xl: "https://cdn.deezer.com/wrong.jpg" },
            { id: 42, name: "Tim Hecker", picture_xl: "https://cdn.deezer.com/tim.jpg" },
          ],
        }),
      ),
      http.get("https://api.deezer.com/search/album", () =>
        HttpResponse.json({
          data: [{ id: 99, title: "Virgins", cover_xl: "https://cdn.deezer.com/virgins.jpg" }],
        }),
      ),
    );

    const artist = await searchDeezerArtistPhoto("Tim Hecker");
    expect(artist).toEqual({ deezerId: "42", imageUrl: "https://cdn.deezer.com/tim.jpg" });

    const cover = await searchDeezerAlbumCover("Tim Hecker", "Virgins");
    expect(cover).toBe("https://cdn.deezer.com/virgins.jpg");

    server.use(
      http.get("https://api.deezer.com/search/artist", () => HttpResponse.json({ data: [] })),
    );
    expect(await searchDeezerArtistPhoto("Unknown Artist")).toBeNull();

    server.use(
      http.get("https://api.deezer.com/search/artist", () => HttpResponse.error()),
      http.get("https://api.deezer.com/search/album", () => HttpResponse.error()),
    );
    expect(await searchDeezerArtistPhoto("Tim Hecker")).toBeNull();
    expect(await searchDeezerAlbumCover("Tim Hecker", "Virgins")).toBeNull();
  });

  it("fetches and trims Wikipedia summary, falling back to (musician) on disambiguation", async () => {
    server.use(
      http.get("https://en.wikipedia.org/w/api.php", ({ request }) => {
        const search = new URL(request.url).searchParams.get("search") ?? "";
        if (search.includes("(musician)")) {
          return HttpResponse.json([search, ["Barker (musician)"], [""], [""]]);
        }
        return HttpResponse.json([search, ["Barker"], [""], [""]]);
      }),
      http.get("https://en.wikipedia.org/api/rest_v1/page/summary/:title", ({ params }) => {
        if (params.title === "Barker") {
          return HttpResponse.json({
            title: "Barker",
            type: "disambiguation",
            extract: "Barker may refer to...",
          });
        }
        return HttpResponse.json({
          title: "Barker (musician)",
          type: "standard",
          extract:
            "Sam Barker is a Berlin-based electronic musician and Berghain resident known for kickless rhythmic techno.",
        });
      }),
    );

    const bio = await fetchWikipediaBio("Barker");
    expect(bio).toContain("Sam Barker is a Berlin-based electronic musician");
  });
});
