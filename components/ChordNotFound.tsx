"use client";

import Image from "next/image";
import { useT } from "@/i18n/LocaleProvider";

export default function ChordNotFound({ name }: { name: string }) {
  const t = useT();
  return (
    <figure className="flex flex-col items-center gap-1 w-[110px]">
      <Image
        src="/notfound.png"
        alt={t("chordNotFound.alt")}
        width={110}
        height={95}
        className="dark:invert opacity-60"
      />
      <figcaption className="text-sm font-medium">{name}</figcaption>
      <p className="text-xs text-muted">{t("chordNotFound.label")}</p>
    </figure>
  );
}
