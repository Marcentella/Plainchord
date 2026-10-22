import Link from "next/link";
import { ArrowRight, Lightbulb, TriangleAlert } from "lucide-react";
import GuideVisual from "@/components/guide/GuideVisual";
import TryTuner from "@/components/guide/TryTuner";
import { splitBold, type GuideBlock } from "@/lib/guide";
import type { Locale } from "@/i18n/locales";
import type { TFunction } from "@/i18n/t";
import { href } from "@/i18n/routes";

const LINK_CLASS =
  "flex w-fit items-center gap-1.5 text-sm font-medium text-accent transition hover-fine:underline active:scale-[0.97] duration-[160ms] ease-out";

const LINK_LABEL = {
  chords: "guide.tryChords",
  tab: "guide.tryTab",
  glossary: "guide.tryGlossary",
} as const;

function Rich({ text }: { text: string }) {
  return splitBold(text).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

function Paragraphs({ text }: { text: string }) {
  return text.split("\n").map((line, i) => (
    <p key={i}>
      <Rich text={line} />
    </p>
  ));
}

/** An article's body, in order. Server-rendered; only the figures and the tuner button are client components. */
export default function GuideBlocks({ blocks, locale, t }: { blocks: GuideBlock[]; locale: Locale; t: TFunction }) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "text":
        return (
          <p key={i} className="leading-relaxed">
            <Rich text={block[locale]} />
          </p>
        );
      case "mnemonic":
      case "mistake": {
        const mnemonic = block.type === "mnemonic";
        const Icon = mnemonic ? Lightbulb : TriangleAlert;
        return (
          <aside key={i} className="flex flex-col gap-1.5 rounded-lg border border-line p-4 leading-relaxed">
            <p
              className={`flex items-center gap-1.5 text-xs font-medium ${mnemonic ? "text-accent" : "text-difficulty-media"}`}
            >
              <Icon size={14} aria-hidden />
              {t(mnemonic ? "guide.mnemonic" : "guide.mistake")}
            </p>
            <Paragraphs text={block[locale]} />
          </aside>
        );
      }
      case "visual":
        return (
          <div key={i} className="py-2">
            <GuideVisual visual={block} />
          </div>
        );
      case "link":
        return block.to === "tuner" ? (
          <TryTuner key={i} className={LINK_CLASS} />
        ) : (
          <Link key={i} href={href(block.to, locale)} className={LINK_CLASS}>
            {t(LINK_LABEL[block.to])}
            <ArrowRight size={14} aria-hidden />
          </Link>
        );
    }
  });
}
