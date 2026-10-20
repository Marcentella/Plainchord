"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/i18n/LocaleProvider";
import { href } from "@/i18n/routes";
import { useLocale } from "@/i18n/useLocale";

// Client component: not-found receives no params, so the locale comes from
// the URL via useLocale() instead.
export default function NotFound() {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <Image
        src="/notfound.png"
        alt=""
        width={160}
        height={138}
        className="dark:invert opacity-60"
      />
      <h1 className="text-xl font-medium">{t("notFound.title")}</h1>
      <p className="text-sm text-muted max-w-sm">{t("notFound.message")}</p>
      <Link
        href={href("chords", locale)}
        className="rounded border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
      >
        {t("notFound.backLink")}
      </Link>
    </div>
  );
}
