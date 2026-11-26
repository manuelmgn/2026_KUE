import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Syne } from "next/font/google";
import { type ReactNode, Suspense } from "react";
import { AppShell, type ShellUpcomingFestival } from "@/components/features/AppShell";
import { ServiceWorkerRegistrar } from "@/components/features/ServiceWorkerRegistrar";
import { I18nProvider } from "@/i18n/context";
import { getServerDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { listFriendsOverview } from "@/server/services/friends";
import { getUnreadNotificationCount } from "@/server/services/notifications";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
});

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getServerDictionary();
  return {
    title: "KUE",
    applicationName: "KUE",
    description: dict.meta.description,
    appleWebApp: {
      capable: true,
      title: "KUE",
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/icons/icon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("kue-theme");var v=t==="light"||t==="dark"?t:"light dark";var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=v;if(t==="light"||t==="dark"){var c=t==="light"?"#f4f4ef":"#000000";document.querySelectorAll('meta[name="theme-color"]').forEach(function(el){el.setAttribute("content",c);});}}catch(e){}})();`;

function formatCompactDates(
  startDate: Date | null,
  endDate: Date | null,
  year: number,
  locale: string,
): string {
  if (!startDate && !endDate) {
    return String(year);
  }
  const shortFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (startDate && endDate && startDate.getTime() !== endDate.getTime()) {
    return `${shortFmt.format(startDate)} – ${shortFmt.format(endDate)}`;
  }
  return shortFmt.format(startDate ?? endDate ?? new Date(Date.UTC(year, 0, 1)));
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [{ locale }, currentUser] = await Promise.all([getServerDictionary(), getCurrentUser()]);

  let upcomingFestivals: ShellUpcomingFestival[] = [];
  let unreadNotificationsCount = 0;
  let incomingRequestsCount = 0;

  if (currentUser) {
    const [editions, unread, friendsOverview] = await Promise.all([
      listUserEditions(currentUser.id).catch(() => []),
      getUnreadNotificationCount(currentUser.id).catch(() => 0),
      listFriendsOverview(currentUser.id).catch(() => ({
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
      })),
    ]);

    unreadNotificationsCount = unread;
    incomingRequestsCount = friendsOverview.incomingRequests.length;

    const todayIso = new Date().toISOString().slice(0, 10);
    upcomingFestivals = editions
      .filter((ed) => {
        const endIso = ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null;
        const startIso = ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null;
        if (endIso) return endIso >= todayIso;
        if (startIso) return startIso >= todayIso;
        return ed.year >= Number(todayIso.slice(0, 4));
      })
      .sort((a, b) => {
        const aKey = a.startDate ? a.startDate.toISOString().slice(0, 10) : `${a.year}-99-99`;
        const bKey = b.startDate ? b.startDate.toISOString().slice(0, 10) : `${b.year}-99-99`;
        return aKey.localeCompare(bKey);
      })
      .slice(0, 3)
      .map((ed) => ({
        id: ed.id,
        brandSlug: ed.festival.slug,
        slug: ed.slug,
        name: ed.festival.name,
        year: ed.year,
        location: ed.location,
        datesLabel: formatCompactDates(ed.startDate, ed.endDate, ed.year, locale),
      }));
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${syne.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable} ${archivo.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Inline theme bootstrap prevents FOUC before hydration */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>
          <ServiceWorkerRegistrar />
          {currentUser ? (
            <Suspense fallback={children}>
              <AppShell
                currentUser={currentUser}
                upcomingFestivals={upcomingFestivals}
                unreadNotificationsCount={unreadNotificationsCount}
                incomingRequestsCount={incomingRequestsCount}
              >
                {children}
              </AppShell>
            </Suspense>
          ) : (
            children
          )}
        </I18nProvider>
      </body>
    </html>
  );
}
