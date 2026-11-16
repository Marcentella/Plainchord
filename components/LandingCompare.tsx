"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsHorizontalIcon, FlameIcon } from "@phosphor-icons/react";
import ChordDiagram from "@/components/ChordDiagram";
import { findChord } from "@/lib/chords";
import { useT } from "@/i18n/LocaleProvider";
import type { TKey } from "@/i18n/t";

const AM = findChord("Am")!;

/** Where the divider rests after its one sweep: mostly the calm side. */
const REST = 35;

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
 * buried under the clutter guitar apps greet beginners with, the right part
 * as PlainChord shows it. A real range input drives the divider (keyboard and
 * screen readers get one labelled slider, the picture itself is hidden). It
 * sweeps once when it first comes on screen, then it's the visitor's.
 */
export default function LandingCompare() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(100);
  const [sweeping, setSweeping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Under reduced motion the CSS drops the transition: it just settles.
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setSweeping(true);
      setPos(REST);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const motion = sweeping ? "landing-compare-sweep" : "";

  return (
    // The input hangs 22px (half its thumb) past each side of the frame, so
    // the thumb's centre lines up with the divider from 0% to 100%.
    // Narrow on purpose: the clutter has to sit on the chord, not beside it.
    <div ref={ref} className="relative w-full max-w-xl">
      <div aria-hidden className="relative h-[26rem] overflow-hidden rounded-lg border border-line sm:h-[30rem]">
        {/* The calm side: the whole frame, under everything. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <ChordDiagram chord={AM} size={170} />
        </div>
        <span className="absolute right-3 top-3 rounded-full border border-line px-3 py-1 text-sm text-muted">PlainChord</span>

        {/* The clutter, cut off at the divider; the veil dims the chord under it. */}
        <div className={`absolute inset-0 bg-[color-mix(in_srgb,var(--background)_45%,transparent)] ${motion}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <div className="landing-compare-ad absolute inset-x-0 top-0 flex h-14 items-center justify-center text-sm font-semibold text-muted">
            <Fake k="landing.fakeAd" />
          </div>
          <div className="absolute left-3 top-[4.5rem] flex items-center gap-1.5 rounded-lg bg-[var(--difficulty-dificil)] px-3 py-2 text-sm font-semibold text-[var(--background)] shadow-lg">
            <FlameIcon size={18} weight="fill" />
            <Fake k="landing.fakeStreak" />
          </div>
          <div className="absolute left-[18%] top-[40%] rounded-full bg-[var(--difficulty-facil)] px-3 py-1 text-sm font-bold text-[var(--background)] shadow-md">
            <Fake k="landing.fakeXp" />
          </div>
          <div className="absolute right-[6%] top-[58%] hidden rounded-lg border-2 border-[var(--difficulty-media)] bg-[var(--background)] px-3 py-2 text-sm font-semibold text-[var(--difficulty-media)] shadow-md sm:block">
            <Fake k="landing.fakePremium" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-line bg-[var(--background)] px-4 py-3 text-sm font-medium shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
            <Fake k="landing.fakeSignup" />
            <Fake k="landing.fakeSignupButton" className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-dot-text" />
          </div>
          <span className="absolute left-3 top-[1.125rem] rounded-full bg-[var(--foreground)] px-3 py-1 text-sm text-[var(--background)]">{t("landing.compareBusy")}</span>
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
  );
}
