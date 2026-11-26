export interface FestivalRouteTarget {
  brandSlug: string;
  year: number;
}

export function festivalHomePath(target: FestivalRouteTarget): string {
  return `/festivals/${encodeURIComponent(target.brandSlug)}/${target.year}`;
}

export function festivalCartelPath(
  target: FestivalRouteTarget,
  query?: Record<string, string | null | undefined>,
): string {
  const base = `${festivalHomePath(target)}/cartel`;
  if (!query) {
    return base;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && value.trim().length > 0) {
      params.set(key, value.trim());
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function festivalAgendaPath(target: FestivalRouteTarget): string {
  return `${festivalHomePath(target)}/agenda`;
}

export function festivalEditPath(target: FestivalRouteTarget): string {
  return `${festivalHomePath(target)}/editar`;
}

export function deriveFestivalExternalLinks(name: string, lineupSourceUrl?: string | null) {
  let officialWeb: string | null = null;
  if (lineupSourceUrl) {
    try {
      const parsed = new URL(lineupSourceUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        officialWeb = parsed.origin;
      }
    } catch {
      officialWeb = null;
    }
  }
  const cleanName = name.trim();
  const webFallback = `https://www.google.com/search?q=${encodeURIComponent(`${cleanName} festival official site`)}`;
  const instagram = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(`${cleanName} festival`)}`;
  const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanName} festival`)}`;

  return {
    officialWeb: officialWeb ?? webFallback,
    hasVerifiedWeb: officialWeb !== null,
    instagram,
    youtube,
  };
}
