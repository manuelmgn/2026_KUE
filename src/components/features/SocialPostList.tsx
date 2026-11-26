"use client";

import Link from "next/link";
import type { SocialPostItemDTO } from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { toMediaApiUrl } from "@/domain/media-url";
import { useI18n } from "@/i18n/context";

interface SocialPostListProps {
  posts: SocialPostItemDTO[];
  showAuthor?: boolean;
}

function formatShortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function SocialPostList({ posts, showAuthor = true }: SocialPostListProps) {
  const { dict, locale } = useI18n();

  return (
    <ul>
      {posts.map((post) => {
        const isHighRating = post.rating !== null && post.rating >= 4;
        const formattedDate = formatShortDate(post.createdAt, locale);

        const actionLabel =
          post.kind === "LIVE_REVIEW"
            ? dict.social.postLiveReview
            : post.kind === "FESTIVAL_ADDED"
              ? dict.social.postAddedFestival
              : post.rating !== null
                ? dict.social.postRatedArtist
                : dict.social.postNotedArtist;

        const targetHref =
          post.kind === "FESTIVAL_ADDED" && post.festival
            ? `/lineup?festival=${encodeURIComponent(post.festival.slug)}`
            : post.festival && post.artist
              ? `/lineup?festival=${encodeURIComponent(post.festival.slug)}&q=${encodeURIComponent(post.artist.name)}`
              : post.festival
                ? `/lineup?festival=${encodeURIComponent(post.festival.slug)}`
                : null;

        const titleText =
          post.kind === "FESTIVAL_ADDED" && post.festival
            ? `${post.festival.name} ${post.festival.year}`
            : (post.entry?.billingName ?? post.artist?.name ?? "");

        const artistImg = post.artist ? toMediaApiUrl(post.artist.imagePath) : null;

        return (
          <li
            key={post.id}
            className="border-b border-line transition-colors hover:bg-surface last:border-b-0"
          >
            <div className="flex flex-col gap-2.5 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {showAuthor ? (
                    <Link
                      href={`/u/${encodeURIComponent(post.author.username)}`}
                      className="flex min-w-0 items-center gap-2.5 hover:underline"
                    >
                      <UserAvatar
                        avatarPath={post.author.avatarPath}
                        username={post.author.username}
                        displayName={post.author.displayName}
                        size="sm"
                      />
                      <span className="truncate font-mono text-xs font-semibold text-ink">
                        @{post.author.username}
                      </span>
                    </Link>
                  ) : null}
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                    {actionLabel}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {post.rating !== null ? (
                    <span
                      className={`border px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                        isHighRating
                          ? "border-acid bg-acid font-semibold text-acid-ink"
                          : "border-line text-ink"
                      }`}
                    >
                      {post.kind === "LIVE_REVIEW"
                        ? dict.social.liveScoreBadge(post.rating)
                        : `${post.rating}/5`}
                    </span>
                  ) : null}
                  <span className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                    {formattedDate}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                {post.artist ? (
                  <Artwork
                    src={artistImg}
                    alt={post.artist.name}
                    seedText={post.artist.name}
                    variant="artist"
                    className="h-12 w-12 shrink-0"
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  {targetHref ? (
                    <Link
                      href={targetHref}
                      className="inline-block font-display text-[1.15rem] font-extrabold leading-tight tracking-[-0.02em] text-ink hover:underline"
                    >
                      {titleText}
                    </Link>
                  ) : (
                    <div className="font-display text-[1.15rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                      {titleText}
                    </div>
                  )}

                  {post.kind !== "FESTIVAL_ADDED" && post.festival ? (
                    <div className="mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                      {[
                        `${post.festival.name} ${post.festival.year}`,
                        post.entry?.day,
                        post.entry?.stage,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ) : post.kind === "FESTIVAL_ADDED" && post.festival?.location ? (
                    <div className="mt-0.5 font-serif text-[0.98rem] italic text-ink-muted">
                      {post.festival.location}
                    </div>
                  ) : null}

                  {post.notes ? (
                    <p className="mt-1.5 whitespace-pre-line font-serif text-[1.08rem] italic leading-[1.38] text-ink">
                      “{post.notes}”
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
