import { describe, expect, it } from "vitest";
import {
  buildAppleMusicAlbumUrl,
  buildAppleMusicArtistUrl,
  buildYouTubeAlbumUrl,
  buildYouTubeArtistUrl,
  buildYouTubeLiveUrl,
  getAlbumExternalLinks,
  getArtistExternalLinks,
} from "@/domain/external-links";

describe("domain/external-links", () => {
  it("builds Apple Music, YouTube, and YouTube Live URLs for standard names", () => {
    expect(buildAppleMusicArtistUrl("Tim Hecker")).toBe(
      "https://music.apple.com/es/search?term=Tim%20Hecker",
    );
    expect(buildYouTubeArtistUrl("Tim Hecker")).toBe(
      "https://www.youtube.com/results?search_query=Tim%20Hecker",
    );
    expect(buildYouTubeLiveUrl("Tim Hecker")).toBe(
      "https://www.youtube.com/results?search_query=Tim%20Hecker%20live",
    );
  });

  it("properly URL-encodes special characters (&, /, |, quotes, accents)", () => {
    expect(buildAppleMusicArtistUrl("Mabe Fratti & Bill Orcutt")).toBe(
      "https://music.apple.com/es/search?term=Mabe%20Fratti%20%26%20Bill%20Orcutt",
    );
    expect(buildYouTubeArtistUrl("BIG|BRAVE")).toBe(
      "https://www.youtube.com/results?search_query=BIG%7CBRAVE",
    );
    expect(buildYouTubeLiveUrl("Diamanda Galás / Live")).toBe(
      "https://www.youtube.com/results?search_query=Diamanda%20Gal%C3%A1s%20%2F%20Live%20live",
    );
    expect(buildAppleMusicAlbumUrl("William Basinski", "'Passing the Cup'")).toBe(
      "https://music.apple.com/es/search?term=William%20Basinski%20'Passing%20the%20Cup'",
    );
    expect(buildYouTubeAlbumUrl("Sarah Davachi", "Cantus, Descant")).toBe(
      "https://www.youtube.com/results?search_query=Sarah%20Davachi%20Cantus%2C%20Descant",
    );
  });

  it("returns grouped link objects for artists and albums", () => {
    const artistLinks = getArtistExternalLinks("  Barker  ");
    expect(artistLinks.appleMusic).toContain("term=Barker");
    expect(artistLinks.youtube).toContain("search_query=Barker");
    expect(artistLinks.youtubeLive).toContain("search_query=Barker%20live");

    const albumLinks = getAlbumExternalLinks("Tim Hecker", "Virgins");
    expect(albumLinks.appleMusic).toBe(
      "https://music.apple.com/es/search?term=Tim%20Hecker%20Virgins",
    );
    expect(albumLinks.youtube).toBe(
      "https://www.youtube.com/results?search_query=Tim%20Hecker%20Virgins",
    );
  });
});
