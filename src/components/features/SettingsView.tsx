"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/context";

function applyTheme(next: "dark" | "light") {
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", next);
  }
  try {
    localStorage.setItem("kue-theme", next);
    window.dispatchEvent(new Event("kue-theme-change"));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function SettingsView() {
  const { locale, dict, setLocale } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [savingLocale, setSavingLocale] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    };
    syncTheme();
    window.addEventListener("kue-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("kue-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const handleLocaleSelect = async (next: Locale) => {
    if (next === locale || savingLocale) {
      return;
    }
    setSavingLocale(true);
    setSavedNotice(false);
    try {
      await setLocale(next);
      setSavedNotice(true);
    } finally {
      setSavingLocale(false);
    }
  };

  const handleThemeSelect = (next: "dark" | "light") => {
    setTheme(next);
    applyTheme(next);
    setSavedNotice(true);
  };

  const languageOptions: Array<{ value: Locale; label: string; meta: string }> = [
    {
      value: "pt-PT",
      label: dict.settings.languagePtLabel,
      meta: dict.settings.languagePtMeta,
    },
    {
      value: "es",
      label: dict.settings.languageEsLabel,
      meta: dict.settings.languageEsMeta,
    },
  ];

  const themeOptions: Array<{ value: "dark" | "light"; label: string; meta: string }> = [
    {
      value: "dark",
      label: dict.settings.themeDarkLabel,
      meta: dict.settings.themeDarkMeta,
    },
    {
      value: "light",
      label: dict.settings.themeLightLabel,
      meta: dict.settings.themeLightMeta,
    },
  ];

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-8 px-6 py-8">
      <div className="border-b border-line pb-6">
        <h1 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
          {dict.settings.title}
        </h1>
        <p className="mt-2 font-serif text-[1.25rem] italic text-ink-muted">
          {dict.settings.subtitle}
        </p>
      </div>

      <section aria-labelledby="settings-language-heading" className="flex flex-col gap-4">
        <div>
          <h2
            id="settings-language-heading"
            className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink"
          >
            {dict.settings.languageSectionTitle}
          </h2>
          <p className="mt-1 font-serif text-[1.08rem] text-ink-muted">
            {dict.settings.languageDescription}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {languageOptions.map((option) => {
            const isActive = locale === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                disabled={savingLocale}
                onClick={() => void handleLocaleSelect(option.value)}
                className={`flex cursor-pointer items-center justify-between gap-4 border p-4 text-left transition-colors disabled:opacity-60 ${
                  isActive
                    ? "border-acid bg-acid text-acid-ink"
                    : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                <div>
                  <div className="font-display text-lg font-extrabold leading-tight">
                    {option.label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                      isActive ? "text-acid-ink/80" : "text-ink-muted"
                    }`}
                  >
                    {option.meta}
                  </div>
                </div>
                {isActive ? (
                  <span className="shrink-0 border border-acid-ink px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em]">
                    {dict.settings.activeBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="settings-theme-heading"
        className="flex flex-col gap-4 border-t border-line pt-8"
      >
        <div>
          <h2
            id="settings-theme-heading"
            className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink"
          >
            {dict.settings.themeSectionTitle}
          </h2>
          <p className="mt-1 font-serif text-[1.08rem] text-ink-muted">
            {dict.settings.themeDescription}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {themeOptions.map((option) => {
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleThemeSelect(option.value)}
                className={`flex cursor-pointer items-center justify-between gap-4 border p-4 text-left transition-colors ${
                  isActive
                    ? "border-acid bg-acid text-acid-ink"
                    : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                <div>
                  <div className="font-display text-lg font-extrabold leading-tight">
                    {option.label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                      isActive ? "text-acid-ink/80" : "text-ink-muted"
                    }`}
                  >
                    {option.meta}
                  </div>
                </div>
                {isActive ? (
                  <span className="shrink-0 border border-acid-ink px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em]">
                    {dict.settings.activeBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {savedNotice ? (
        <p
          role="status"
          className="border border-line bg-surface px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ink-muted"
        >
          {dict.settings.savedNotice}
        </p>
      ) : null}
    </main>
  );
}

