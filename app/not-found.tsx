import Image from "next/image";
import Link from "next/link";
import { t } from "@/i18n";

export default function NotFound() {
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
        href="/"
        className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
      >
        {t("notFound.backLink")}
      </Link>
    </div>
  );
}
