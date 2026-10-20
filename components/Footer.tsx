import Link from "next/link";
import { getT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { href } from "@/i18n/routes";

// Server component: rendered once by the root layout, which passes the locale.
export default function Footer({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/70 bg-white/20 px-6 py-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-[3px] dark:border-white/10 dark:bg-white/5 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] text-xs text-muted">
      <span>{t("footer.copyright", { year: String(new Date().getFullYear()) })}</span>
      <nav className="flex gap-4">
        <Link href={href("terms", locale)} className="transition-colors hover-fine:text-accent">
          {t("nav.terms")}
        </Link>
        <Link href={href("privacy", locale)} className="transition-colors hover-fine:text-accent">
          {t("nav.privacy")}
        </Link>
      </nav>
    </footer>
  );
}
