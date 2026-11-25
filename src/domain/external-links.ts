export interface ArtistExternalLinks {
  appleMusic: string;
  youtube: string;
  youtubeLive: string;
}

export interface AlbumExternalLinks {
  appleMusic: string;
  youtube: string;
}

export function buildAppleMusicArtistUrl(artistName: string): string {
  const query = artistName.trim();
  return `https://music.apple.com/es/search?term=${encodeURIComponent(query)}`;
}

export function buildAppleMusicAlbumUrl(artistName: string, albumTitle: string): string {
  const query = `${artistName.trim()} ${albumTitle.trim()}`.trim();
  return `https://music.apple.com/es/search?term=${encodeURIComponent(query)}`;
}

export function buildYouTubeArtistUrl(artistName: string): string {
  const query = artistName.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function buildYouTubeLiveUrl(artistName: string): string {
  const query = `${artistName.trim()} live`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function buildYouTubeAlbumUrl(artistName: string, albumTitle: string): string {
  const query = `${artistName.trim()} ${albumTitle.trim()}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function getArtistExternalLinks(artistName: string): ArtistExternalLinks {
  return {
    appleMusic: buildAppleMusicArtistUrl(artistName),
    youtube: buildYouTubeArtistUrl(artistName),
    youtubeLive: buildYouTubeLiveUrl(artistName),
  };
}

export function getAlbumExternalLinks(artistName: string, albumTitle: string): AlbumExternalLinks {
  return {
    appleMusic: buildAppleMusicAlbumUrl(artistName, albumTitle),
    youtube: buildYouTubeAlbumUrl(artistName, albumTitle),
  };
}
