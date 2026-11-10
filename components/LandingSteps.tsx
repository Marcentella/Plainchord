"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@phosphor-icons/react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordName from "@/components/ChordName";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord } from "@/lib/chords";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { href, type PageId } from "@/i18n/routes";
import { useLocale } from "@/i18n/useLocale";
import { useT } from "@/i18n/LocaleProvider";
import type { TKey } from "@/i18n/t";

const G = findChord("G")!;
const Am = findChord("Am")!;
const F = findChord("F")!;
const PLAY = ["G", "D", "Em", "C"];

// A plain G arpeggio of our own — never a song's tab (see the no-hosting rule).
const TAB = ["e|---------3--|", "B|-------0----|", "G|-----0------|", "D|---0--------|", "A|------------|", "E|-3----------|"];

function Tuner() {
  return (
    <svg viewBox="0 0 160 96" width={160} height={96} aria-hidden>
      <path d="M 20 86 A 60 60 0 0 1 140 86" fill="none" stroke="var(--line)" strokeWidth={2} />
      {[-60, -40, -20, 20, 40, 60].map((a) => (
        <line key={a} x1={80} y1={30} x2={80} y2={36} stroke="var(--muted)" strokeWidth={1.5} transform={`rotate(${a} 80 86)`} />
      ))}
      <line x1={80} y1={22} x2={80} y2={34} stroke="var(--difficulty-facil)" strokeWidth={2.5} />
      <line className="loop-needle" x1={80} y1={86} x2={80} y2={34} stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" />
      <circle cx={80} cy={86} r={4} fill="var(--foreground)" />
      <text className="loop-note" x={80} y={70} textAnchor="middle" fontSize={20} fontWeight={500}>
        E
      </text>
    </svg>
  );
}

function HardChange() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <ChordDiagram chord={Am} size={64} />
      <div className="flex flex-col items-center gap-1">
        <svg width={40} height={12} viewBox="0 0 40 12">
          <path className="loop-arrow" d="M2 6 H34 M28 1 L35 6 L28 11" fill="none" stroke="var(--difficulty-dificil)" strokeWidth={2} />
        </svg>
        <TransitionBadge difficulty={transitionDifficulty(Am, F)} />
      </div>
      <ChordDiagram chord={F} size={64} />
    </div>
  );
}

function PlayAlong() {
  return (
    <div className="grid grid-cols-2 gap-2" aria-hidden>
      {PLAY.map((name, i) => (
        <span key={name} className="loop-play flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-base font-medium" style={{ animationDelay: `${i * 0.8}s` }}>
          <ChordName name={name} />
          <CheckIcon size={16} className="loop-play-check" />
        </span>
      ))}
    </div>
  );
}

function Tab() {
  return (
    <div className="relative font-mono text-xs" aria-hidden>
      <pre className="leading-snug text-muted">{TAB.join("\n")}</pre>
      <span className="loop-playhead absolute inset-y-0 left-[1.5ch] w-0.5 rounded-full bg-accent" />
    </div>
  );
}

const STEPS: { title: TKey; body: TKey; visual: React.ReactNode; page?: PageId }[] = [
  { title: "landing.step1Title", body: "landing.step1Body", visual: <Tuner /> },
  { title: "landing.step2Title", body: "landing.step2Body", visual: <div className="loop-fingers" aria-hidden><ChordDiagram chord={G} size={88} /></div>, page: "chords" },
  { title: "landing.step3Title", body: "landing.step3Body", visual: <HardChange />, page: "chords" },
  { title: "landing.step4Title", body: "landing.step4Body", visual: <PlayAlong />, page: "chords" },
  { title: "landing.step5Title", body: "landing.step5Body", visual: <Tab />, page: "tab" },
];

/**
 * The suggested path as five cards, each with a short loop of the real
 * thing. The loops only start once the row is on screen (so they haven't
 * already finished by the time anyone scrolls down), run a few rounds, then
 * rest; hovering a card plays it again (globals.css, "Landing").
 */
export default function LandingSteps() {
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLOListElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setOn(true);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 3 + 2 from lg up (six tracks: spans of 2, then 3) so each card has room
  // for 16px text; two columns on tablets, one on phones.
  return (
    <ol ref={ref} data-on={on || undefined} className="landing-steps grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {STEPS.map((step, i) => {
        const inner = (
          <>
            <div className="flex h-36 items-center justify-center">{step.visual}</div>
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium tabular-nums">{i + 1}</span>
              <h3 className="text-xl font-medium leading-snug tracking-tight">{t(step.title)}</h3>
              <p className="text-pretty text-base leading-relaxed text-muted">{t(step.body)}</p>
            </div>
          </>
        );
        const card = "landing-step flex h-full flex-col gap-5 rounded-lg border border-line p-5";
        return (
          <li key={step.title} className={i < 3 ? "lg:col-span-2" : i === 4 ? "sm:col-span-2 lg:col-span-3" : "lg:col-span-3"}>
            {step.page ? (
              <Link href={href(step.page, locale)} className={`${card} transition duration-[160ms] ease-out hover-fine:-translate-y-0.5 hover-fine:border-accent`}>
                {inner}
              </Link>
            ) : (
              <div className={card}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
