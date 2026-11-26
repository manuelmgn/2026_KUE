import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Syne } from "next/font/google";
import { type ReactNode, Suspense } from "react";
import { BottomNav } from "@/components/features/BottomNav";
import { ServiceWorkerRegistrar } from "@/components/features/ServiceWorkerRegistrar";
import { I18nProvider } from "@/i18n/context";
import { getServerDictionary } from "@/i18n/server";
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
    description: dict.meta.description,
    icons: {
      icon: "/icons/icon.svg",
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("kue-theme");var v=t==="light"||t==="dark"?t:"light dark";var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=v;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { locale } = await getServerDictionary();

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
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </I18nProvider>
      </body>
    </html>
  );
}
