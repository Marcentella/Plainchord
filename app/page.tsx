import Link from "next/link";
import ChordDiagram from "@/components/ChordDiagram";
import LandingHero from "@/components/LandingHero";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord } from "@/lib/chords";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { t } from "@/i18n";

// Placeholder landing (v2 "calma" sketch in Figma) until the real design
// pass: one action, a suggested order for beginners, and what PlainChord
// deliberately leaves out. Every visual is a real component, so a redesign
// only touches styling and copy.

const G = findChord("G")!;
const D = findChord("D")!;
const EXAMPLE_CHANGES = [
  ["G", "D"],
  ["D", "Em"],
  ["Em", "C"],
] as const;

const STEPS = [
  { title: "landing.step1Title", body: "landing.step1Body" },
  {
    title: "landing.step2Title",
    body: "landing.step2Body",
    visual: (
      <div className="flex gap-6">
        <ChordDiagram chord={G} />
        <ChordDiagram chord={D} />
      </div>
    ),
  },
  {
    title: "landing.step3Title",
    body: "landing.step3Body",
    visual: (
      <ul className="flex flex-col gap-3">
        {EXAMPLE_CHANGES.map(([a, b]) => (
          <li key={a + b} className="flex items-center gap-5">
            <span className="w-24 text-lg font-medium">
              {a} → {b}
            </span>
            <TransitionBadge difficulty={transitionDifficulty(findChord(a)!, findChord(b)!)} />
          </li>
        ))}
      </ul>
    ),
  },
  { title: "landing.step4Title", body: "landing.step4Body" },
  {
    title: "landing.step5Title",
    body: "landing.step5Body",
    link: { href: "/tablatura", label: "landing.step5Link" },
  },
] as const;

const LEFT_OUT = ["landing.leftOut1", "landing.leftOut2", "landing.leftOut3", "landing.leftOut4"] as const;

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6">
      <section className="flex flex-col gap-8 pb-24 pt-16 sm:pt-24">
        <h1 className="max-w-4xl text-balance text-5xl font-medium leading-[1.05] tracking-tight sm:text-7xl">
          {t("landing.title")}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">{t("landing.subtitle")}</p>
        <LandingHero />
      </section>

      {/* Numbered because it IS a sequence — a suggested order, not a course. */}
      <section className="border-t border-line py-20">
        <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">{t("landing.startTitle")}</h2>
        <p className="mt-3 max-w-xl text-lg text-muted">{t("landing.startIntro")}</p>
        <ol className="mt-12">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="grid gap-6 border-t border-line py-10 sm:grid-cols-[2.5rem_minmax(0,26rem)_1fr] sm:gap-10"
            >
              <span className="text-xl font-medium text-muted tabular-nums">{i + 1}</span>
              <div className="flex flex-col gap-2">
                <h3 className="text-2xl font-medium tracking-tight">{t(step.title)}</h3>
                <p className="leading-relaxed text-muted">{t(step.body)}</p>
                {"link" in step && (
                  <Link href={step.link.href} className="mt-1 w-fit text-accent hover-fine:underline">
                    {t(step.link.label)}
                  </Link>
                )}
              </div>
              {"visual" in step && <div>{step.visual}</div>}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-10 border-t border-line py-20 sm:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">{t("landing.leftOutTitle")}</h2>
          <p className="text-lg text-muted">{t("landing.leftOutBody")}</p>
        </div>
        <ul className="flex flex-col gap-2 text-2xl tracking-tight sm:text-3xl">
          {LEFT_OUT.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-start gap-8 border-t border-line py-24">
        <h2 className="text-4xl font-medium tracking-tight sm:text-6xl">{t("landing.closeTitle")}</h2>
        <Link
          href="/acordes"
          className="rounded-xl bg-accent px-6 py-4 text-lg font-medium text-dot-text transition active:scale-[0.97] duration-[160ms] ease-out"
        >
          {t("landing.closeCta")}
        </Link>
      </section>
    </div>
  );
}
