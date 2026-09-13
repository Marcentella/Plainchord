import Link from "next/link";
import { t } from "@/i18n";

export default function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4 text-xs text-muted">
      <span>{t("footer.copyright", { year: String(new Date().getFullYear()) })}</span>
      <nav className="flex gap-4">
        <Link href="/terminos" className="hover:text-accent">
          {t("nav.terms")}
        </Link>
        <Link href="/privacidad" className="hover:text-accent">
          {t("nav.privacy")}
        </Link>
      </nav>
    </footer>
  );
}
