"use client";

import Link from "next/link";
import type { SocialPostItemDTO } from "@/components/features/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { festivalCartelPath, festivalHomePath } from "@/domain/festival-routes";
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
  }).format(date);
}

function HeroScoreBlock({ rating }: { rating: number }) {
  const styleClass =
    rating >= 4
      ? "border-transparent bg-acid text-acid-ink"
      : rating === 3
        ? "border-line-strong bg-surface text-ink"
        : "border-line-strong bg-surface-elevated text-ink";

  return (
    <div
      className={`flex h-[50px] w-[62px] shrink-0 items-baseline justify-center gap-0.5 border pt-2.5 ${styleClass}`}
    >
      <span className="font-display text-[1.6rem] font-extrabold leading-none">{rating}</span>
      <span className="font-mono text-[0.64rem] font-semibold leading-none opacity-75">/5</span>
    </div>
  );
}

export function SocialPostList({ posts, showAuthor = true }: SocialPostListProps) {
  const { dict, locale } = useI18n();

  return (
    <ul>
      {posts.map((post) => {
        const formattedDate = formatShortDate(post.createdAt, locale);

        const targetHref =
          post.kind === "FESTIVAL_ADDED" && post.festival
            ? festivalHomePath({
                brandSlug: post.festival.brandSlug,
                year: post.festival.year,
              })
            : post.festival && post.artist
              ? festivalCartelPath(
                  { brandSlug: post.festival.brandSlug, year: post.festival.year },
                  { q: post.artist.name },
                )
              : post.festival
                ? festivalHomePath({
                    brandSlug: post.festival.brandSlug,
                    year: post.festival.year,
                  })
                : null;

        const titleText =
          post.kind === "FESTIVAL_ADDED" && post.festival
            ? `${post.festival.name} ${post.festival.year}`
            : (post.entry?.billingName ?? post.artist?.name ?? "");

        const isLiveReview = post.kind === "LIVE_REVIEW";
        const hasPreToPost =
          isLiveReview &&
          post.rating !== null &&
          post.preRating !== null &&
          post.preRating !== undefined;

        return (
          <li
            key={post.id}
            className="border-b border-line transition-colors hover:bg-surface last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.64rem] uppercase tracking-[0.06em]">
                  {showAuthor ? (
                    <Link
                      href={`/u/${encodeURIComponent(post.author.username)}`}
                      className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink hover:underline"
                    >
                      <UserAvatar
                        avatarPath={post.author.avatarPath}
                        username={post.author.username}
                        displayName={post.author.displayName}
                        size="sm"
                      />
                      <span className="truncate">@{post.author.username}</span>
                    </Link>
                  ) : null}

                  {post.kind === "FESTIVAL_ADDED" ? (
                    <span className="text-ink-muted">{dict.social.postAddedFestival}</span>
                  ) : post.festival ? (
                    <Link
                      href={festivalHomePath({
                        brandSlug: post.festival.brandSlug,
                        year: post.festival.year,
                      })}
                      className="border border-line bg-surface px-1.5 py-0.5 text-ink hover:border-ink"
                    >
                      {post.festival.name} {post.festival.year}
                    </Link>
                  ) : null}

                  {isLiveReview ? (
                    <span className="border border-line px-1.5 py-0.5 text-ink-muted">
                      {dict.social.postLiveReview}
                    </span>
                  ) : null}

                  {formattedDate ? <span className="text-ink-muted">· {formattedDate}</span> : null}
                </div>

                {targetHref ? (
                  <Link
                    href={targetHref}
                    className="mt-1 block truncate font-display text-[1.12rem] font-extrabold leading-tight tracking-[-0.02em] text-ink hover:underline"
                  >
                    {titleText}
                  </Link>
                ) : (
                  <div className="mt-1 truncate font-display text-[1.12rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                    {titleText}
                  </div>
                )}

                {post.kind === "FESTIVAL_ADDED" && post.festival?.location ? (
                  <div className="mt-0.5 font-serif text-[0.94rem] italic text-ink-muted">
                    {post.festival.location}
                  </div>
                ) : null}
              </div>

              {/* Right Protagonist Score Area — ZERO written notes/comments; pre → post evolution on live reviews */}
              {post.rating !== null ? (
                <div className="flex shrink-0 items-center gap-2">
                  {hasPreToPost && post.preRating !== null && post.preRating !== undefined ? (
                    <div className="flex items-center gap-1.5 font-mono text-ink-muted">
                      <span className="border border-line px-1.5 py-0.5 text-[0.72rem] font-semibold text-ink">
                        {post.preRating}/5
                      </span>
                      <span aria-hidden="true" className="text-xs text-ink-muted">
                        →
                      </span>
                    </div>
                  ) : null}
                  <HeroScoreBlock rating={post.rating} />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
