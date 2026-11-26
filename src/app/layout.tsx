import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Syne } from "next/font/google";
import { type ReactNode, Suspense } from "react";
import { BottomNav } from "@/components/features/BottomNav";
import { ServiceWorkerRegistrar } from "@/components/features/ServiceWorkerRegistrar";
import { I18nProvider } from "@/i18n/context";
import { getServerDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { toFestivalSummary } from "@/server/services/mappers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [{ locale }, currentUser] = await Promise.all([getServerDictionary(), getCurrentUser()]);
  const festivalSummaries = currentUser
    ? await listUserEditions(currentUser.id)
        .then((rows) => rows.map(toFestivalSummary))
        .catch(() => [])
    : [];

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
          {children}
          {currentUser ? (
            <Suspense fallback={null}>
              <BottomNav festivals={festivalSummaries} />
            </Suspense>
          ) : null}
        </I18nProvider>
      </body>
    </html>
  );
}
