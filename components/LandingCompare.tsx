"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowsHorizontalIcon, BellIcon, CrownIcon, DiamondIcon, FlameIcon, HeartIcon, XIcon } from "@phosphor-icons/react";
import ChordDiagram from "@/components/ChordDiagram";
import { findChord } from "@/lib/chords";
import { useT } from "@/i18n/LocaleProvider";
import type { TKey } from "@/i18n/t";

const AM = findChord("Am")!;

/** Where the divider rests after its one sweep: mostly the calm side. */
const REST = 35;

/** Confetti that bursts with each "+50 XP": end offset, spin, colour. */
const CONFETTI: [number, number, number, string][] = [
  [-58, -46, 220, "var(--n-red)"], [-30, -70, -160, "var(--n-gold)"], [6, -78, 300, "var(--n-blue)"],
  [40, -62, -240, "var(--n-violet)"], [66, -34, 180, "var(--n-pink)"], [-70, -8, -200, "var(--n-blue)"],
  [74, 4, 260, "var(--n-gold)"], [-44, 22, 140, "var(--n-violet)"], [48, 28, -120, "var(--n-red)"],
  [-14, -54, 90, "var(--n-pink)"],
];

/**
 * Fake UI text. Drawn from a data attribute by CSS (.landing-fake::before),
 * so tools that read the page as plain text never pick up "+50 XP" or
 * "Anuncio" as if PlainChord said them.
 */
function Fake({ k, className = "" }: { k: TKey; className?: string }) {
  const t = useT();
  return <span className={`landing-fake ${className}`} data-text={t(k)} />;
}

/**
 * "We left out the noise", shown: the same Am diagram twice, the left part
 * buried under the screen a gamified guitar app greets beginners with
 * (hearts that break, a streak, XP bursts, an ad, a sign-up wall), all
 * moving at once; the right part as PlainChord shows it, still. A real range
 * input drives the divider (keyboard and screen readers get one labelled
 * slider, the picture itself is hidden). It sweeps once when it first comes
 * on screen, then it's the visitor's. The noise loops only while on screen.
 */
export default function LandingCompare() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(100);
  const [sweeping, setSweeping] = useState(false);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let swept = false;
    // Under reduced motion the CSS drops the transition and the loops.
    const io = new IntersectionObserver(([entry]) => {
      setOnScreen(entry.isIntersecting);
      if (swept || entry.intersectionRatio < 0.6) return;
      swept = true;
      setSweeping(true);
      setPos(REST);
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const motion = sweeping ? "landing-compare-sweep" : "";
  const paused = onScreen && pos > 2 ? "" : "landing-noise-paused";

  return (
    <div ref={ref} className="w-full max-w-xl">
      {/* The input hangs 22px (half its thumb) past each side of the frame, so
          the thumb's centre lines up with the divider from 0% to 100%.
          Narrow on purpose: the clutter has to sit on the chord, not beside it. */}
      <div className="relative">
        <div aria-hidden className="relative h-[26rem] overflow-hidden rounded-lg border border-line sm:h-[30rem]">
          {/* The calm side: the whole frame, under everything. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <ChordDiagram chord={AM} size={170} />
          </div>

          {/* The noise, cut off at the divider; the veil dims the chord under it. */}
          <div
            className={`landing-noise absolute inset-0 bg-[color-mix(in_srgb,var(--background)_40%,transparent)] text-sm font-bold ${motion} ${paused}`}
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          >
            {/* Status bar: close, hearts (the last one keeps breaking), streak, gems, bell. */}
            <div className="absolute inset-x-0 top-0 flex h-12 items-center gap-3 border-b border-line bg-[var(--background)] px-3">
              <XIcon size={18} className="shrink-0 text-muted" />
              <div className="flex gap-0.5 text-[var(--n-red)]">
                {[0, 1, 2, 3].map((i) => <HeartIcon key={i} size={18} weight="fill" />)}
                <span className="relative">
                  <HeartIcon size={18} weight="fill" className="noise-heart" />
                  <span className="noise-minus absolute -top-3 left-1 text-xs">-1</span>
                </span>
              </div>
              <span className="ml-auto flex items-center gap-1 text-[var(--n-orange)]">
                <FlameIcon size={18} weight="fill" className="noise-flicker" />9
              </span>
              <span className="flex items-center gap-1 text-[var(--n-blue)]">
                <DiamondIcon size={16} weight="fill" />480
              </span>
              <span className="noise-bell relative shrink-0 text-muted">
                <BellIcon size={20} weight="fill" />
                <span className="noise-badge absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-[var(--n-red)] text-[10px] leading-none text-white">3</span>
              </span>
            </div>

            {/* Lesson progress, shining at you. */}
            <div className="absolute inset-x-3 top-[3.75rem] h-3.5 overflow-hidden rounded-full bg-line">
              <div className="noise-progress h-full w-3/5 rounded-full bg-accent" />
            </div>

            <div className="landing-compare-ad absolute inset-x-3 top-[5.5rem] flex h-10 items-center justify-center rounded-md text-xs uppercase tracking-widest text-muted">
              <Fake k="landing.fakeAd" />
            </div>

            {/* The streak toast slides in over the chord, then out, then in again. */}
            <div className="noise-toast noise-chunk absolute right-3 top-[9rem] flex items-center gap-1.5 rounded-xl border-2 border-[var(--n-orange)] bg-[var(--background)] px-3 py-2">
              <FlameIcon size={18} weight="fill" className="noise-flicker text-[var(--n-orange)]" />
              <Fake k="landing.fakeStreak" />
            </div>

            {/* XP pops off the chord with confetti, every few seconds. */}
            <div className="absolute left-[56%] top-[46%]">
              <span className="noise-confetti">
                {CONFETTI.map(([x, y, r, c], i) => (
                  <i key={i} style={{ "--x": `${x}px`, "--y": `${y}px`, "--r": `${r}deg`, "--c": c } as CSSProperties} />
                ))}
              </span>
              <span className="noise-xp noise-chunk absolute whitespace-nowrap rounded-full bg-[var(--n-gold)] px-3 py-1 text-[#3a2a00]">
                <Fake k="landing.fakeXp" />
              </span>
            </div>

            <div className="noise-wobble noise-chunk absolute left-3 top-[62%] hidden items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-dot-text sm:flex">
              <CrownIcon size={18} weight="fill" />
              <Fake k="landing.fakePremium" />
            </div>

            {/* The sign-up wall. */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 rounded-t-2xl border-t border-line bg-[var(--background)] px-4 py-3 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
              <Fake k="landing.fakeSignup" className="font-medium" />
              <Fake k="landing.fakeSignupButton" className="noise-cta relative shrink-0 rounded-xl bg-[var(--n-violet)] px-4 py-2 uppercase tracking-wide text-white" />
            </div>
          </div>

          {/* The divider and its handle. */}
          <div className={`pointer-events-none absolute inset-y-0 -ml-px w-0.5 bg-[var(--foreground)] ${motion}`} style={{ left: `${pos}%` }}>
            <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--foreground)] bg-[var(--background)]">
              <ArrowsHorizontalIcon size={20} />
            </span>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => {
            setSweeping(false);
            setPos(Number(e.target.value));
          }}
          aria-label={t("landing.compareLabel")}
          className="landing-compare-range absolute inset-y-0 -left-[22px] w-[calc(100%+44px)]"
        />
      </div>

      {/* Which side is which, out of the picture so the noise gets the whole frame. */}
      <div aria-hidden className="mt-3 flex justify-between text-sm text-muted">
        <span>{t("landing.compareBusy")}</span>
        <span>PlainChord</span>
      </div>
    </div>
  );
}
