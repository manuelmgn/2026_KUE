"use client";

import { useState } from "react";
import { toMediaApiUrl } from "@/domain/media-url";

interface UserAvatarProps {
  avatarPath: string | null | undefined;
  username: string;
  displayName?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-2xl",
  xl: "h-24 w-24 text-3xl sm:h-28 sm:w-28 sm:text-4xl",
};

function computeMonogram(username: string, displayName?: string | null): string {
  const source = (displayName?.trim() || username.trim() || "U").replace(/^@+/, "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2 && parts[0]?.[0] && parts[1]?.[0]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  avatarPath,
  username,
  displayName,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = toMediaApiUrl(avatarPath ?? null);
  const showImage = Boolean(src) && failedSrc !== src;
  const monogram = computeMonogram(username, displayName);

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-line bg-[#080808] select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {showImage && src ? (
        // biome-ignore lint/performance/noImgElement: Local media volume avatar served from /api/media with immutable hash
        <img
          src={src}
          alt={displayName ? `${displayName} (@${username})` : `@${username}`}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="kue-editorial-img block h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="relative flex h-full w-full items-center justify-center bg-[#0A0A0A] text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 64 64"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
          >
            <line x1="0" y1="64" x2="64" y2="0" stroke="#FFFFFF" strokeWidth="1" />
          </svg>
          <span className="relative font-display font-extrabold uppercase leading-none tracking-[-0.04em]">
            {monogram}
          </span>
        </div>
      )}
    </div>
  );
}
