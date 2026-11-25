"use client";

import { useState } from "react";

interface ArtworkProps {
  src: string | null;
  alt: string;
  seedText: string;
  variant?: "artist" | "album";
  className?: string;
}

function hashSeed(text: string): number {
  let hash = 17;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return hash + 7;
}

function GenerativeSwissFallback({ seedText }: { seedText: string }) {
  const seed = hashSeed(seedText);
  const lines = Array.from({ length: 18 }, (_, i) => {
    const y = i * 12 + ((seed * i) % 9);
    const opacity = Number((0.14 + ((seed + i * 7) % 68) / 100).toFixed(2));
    const y2 = y + ((i % 3) - 1) * 18;
    const width = 1 + (i % 2);
    return { key: i, y, y2, opacity, width };
  });

  const cx = 60 + ((seed * 17) % 200);
  const cy = 40 + ((seed * 13) % 110);
  const r = 24 + (seed % 34);

  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="h-full w-full block transition-transform duration-300 group-hover:scale-[1.03]"
    >
      <rect width="320" height="200" fill="#080808" />
      {lines.map((line) => (
        <line
          key={line.key}
          x1="0"
          y1={line.y}
          x2="320"
          y2={line.y2}
          stroke="#FFFFFF"
          strokeOpacity={line.opacity}
          strokeWidth={line.width}
        />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeOpacity="0.7"
      />
    </svg>
  );
}

export function Artwork({ src, alt, seedText, variant = "artist", className = "" }: ArtworkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const radiusClass = variant === "album" ? "album-cover-radius" : "";

  return (
    <div
      className={`relative overflow-hidden border border-line bg-[#080808] ${radiusClass} ${className}`}
    >
      {showImage && src ? (
        // biome-ignore lint/performance/noImgElement: Local Docker volume images served from /api/media with immutable cache
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-cover ${
            variant === "artist" ? "kue-editorial-img" : "block"
          } ${radiusClass}`}
        />
      ) : (
        <GenerativeSwissFallback seedText={seedText} />
      )}
    </div>
  );
}
