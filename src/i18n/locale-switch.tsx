"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { locales, localeNames, type Locale } from "./dictionary";

// Sets the choice for this visit and remembers it for the next scan, so a guest
// picks their language once per phone rather than once per page.
export function LocaleSwitch({ current }: { current: Locale }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  function choose(locale: Locale) {
    document.cookie = `lang=${locale}; path=/; max-age=31536000; samesite=lax`;
    const next = new URLSearchParams(params);
    next.set("lang", locale);
    router.replace(`${path}?${next}`);
    router.refresh();
  }
  return <nav className="locale-switch" aria-label="Language">
    {locales.map(locale => <button key={locale} type="button" aria-pressed={locale === current} onClick={() => choose(locale)}>{localeNames[locale]}</button>)}
  </nav>;
}
