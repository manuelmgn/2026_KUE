import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Syne } from "next/font/google";
import type { ReactNode } from "react";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      className={`${syne.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable} ${archivo.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
