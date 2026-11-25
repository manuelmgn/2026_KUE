import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Syne } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorkerRegistrar } from "@/components/features/ServiceWorkerRegistrar";
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

export const metadata: Metadata = {
  title: "KUE",
  description: "Archivo personal y preparación editorial de festivales de música",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("kue-theme");var v=t==="light"?"light":"dark";document.documentElement.dataset.theme=v;var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=v;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${syne.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable} ${archivo.variable}`}
    >
      <head>
        <meta name="color-scheme" content="dark" />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Inline theme bootstrap prevents FOUC before hydration */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
