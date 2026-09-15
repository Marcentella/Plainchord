"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import ChordProgressionInput from "@/components/ChordProgressionInput";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord, parseProgression } from "@/lib/chords";
import { diffTokens } from "@/lib/diffTokens";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { cssDurationMs } from "@/lib/cssTiming";
import { t } from "@/i18n";

const CHORD_LIMIT = 16;

// Literal, curated progressions — no transposition, no matching logic (see
// FEATURES.md's "evaluado y pausado" note on why the dynamic version isn't
// built). Every chord here already exists in data/chords.json so none of
// these ever render as "no encontrado".
const COMMON_PROGRESSIONS = [
  "G - D - Em - C",
  "C - G - Am - Em",
  "Am - Dm - E7",
  "D - A - G",
  "E - A - B7",
  "C - Am - Dm - G7",
];

// A single string value — same simple case as the theme/palette
// preferences (see FEATURES.md's palette section for why localStorage,
// not IndexedDB, is the right store for a value like this). IndexedDB is
// reserved for the actual imported-tab data (Fase 2, not built yet),
// which is structured and much larger — not a one-off string.
const PROGRESSION_KEY = "progression";

// Next.js server-renders this "use client" component too, and
// useLayoutEffect logs a warning when it runs during SSR (there's no DOM
// to act on yet there) — falls back to plain useEffect on the server,
// where neither actually does anything before the client takes over
// anyway. Standard pattern (Framer Motion, Redux, etc. ship the same
// helper) for exactly this "sync client-only state without a visible
// flash" case.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Home() {
  const [input, setInput] = useState("G - D - Em - C");
  const [showDifficulty, setShowDifficulty] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Gates the save effect below until the load effect has actually run —
  // without it, the save effect's first firing (mount, `input` still the
  // hardcoded default) would immediately overwrite whatever was just
  // restored. Same hydration-safe shape as ThemeToggle/PalettePicker:
  // start from the hardcoded default (matches SSR, no mismatch), sync
  // from storage only after mount.
  const [progressionLoaded, setProgressionLoaded] = useState(false);

  // useLayoutEffect, not useEffect: it runs before the browser paints the
  // hydrated commit, so a saved progression different from the hardcoded
  // default lands in that SAME paint instead of a separate, later one.
  // With useEffect (which fires strictly after paint), the page visibly
  // rendered the 4-chord default first, then — a frame or more later —
  // swapped to the real saved progression, resizing the chord grid and
  // shoving the footer down/up after the page already looked settled.
  useIsomorphicLayoutEffect(() => {
    const saved = localStorage.getItem(PROGRESSION_KEY);
    if (saved) setInput(saved);
    setProgressionLoaded(true);
  }, []);

  // Saves on every change, not just on unmount/navigation — a browser tab
  // close doesn't reliably fire cleanup effects, but every keystroke does
  // fire this one.
  useEffect(() => {
    if (progressionLoaded) localStorage.setItem(PROGRESSION_KEY, input);
  }, [input, progressionLoaded]);

  const allTokens = useMemo(() => parseProgression(input), [input]);
  // Only the first CHORD_LIMIT chords are ever rendered — see slotIdsRef's
  // comment for why an edit anywhere in the list can still affect what
  // falls inside vs outside this window.
  const tokens = allTokens.slice(0, CHORD_LIMIT);

  // Removed cards stay mounted (rendered as their own trailing group,
  // "exiting") for --chord-card-transition-duration so they can fade+sink
  // out instead of vanishing instantly — see .chord-card-exiting in
  // globals.css.
  //
  // Every real chord — not just visible ones — gets a permanent numeric
  // id, assigned once and never reused, kept in `slotIdsRef` index-aligned
  // with the FULL `allTokens` (not the truncated `tokens`). A chord and its
  // later exiting-tail entry share that SAME id/key, so:
  //   - going real -> exiting is a class change on the SAME DOM node (an
  //     actual transition) instead of a remount already born in the
  //     exited end-state (no transition to play).
  //   - a real chord typed while an earlier one is still fading always
  //     gets a BRAND NEW id, so it can never land on the still-exiting
  //     item's key and hijack its DOM node.
  //   - `diffTokens` finds exactly where an edit happened (not just
  //     whether the count grew or shrank), so ids are inserted/removed at
  //     the true position — a chord edited in the middle of the
  //     progression gets ITS OWN id treatment, not whichever slot happens
  //     to be last. The tradeoff from keying by slot at all: React still
  //     reconciles by position for whatever DIDN'T change identity, so a
  //     chord that shifts slots because of a nearby insert/delete just
  //     snaps to its new spot instantly rather than sliding — intentional,
  //     see the "different hell" conversation on why animating that slide
  //     is a much bigger feature than this.
  //   - tracking the FULL list (not just the visible 16) means a chord
  //     pushed past CHORD_LIMIT by an edit elsewhere is treated exactly
  //     like a deletion (it fades out) instead of silently vanishing, and
  //     a chord that newly slides under the limit plays a normal entrance
  //     the first time it's ever rendered — no extra logic needed for
  //     that direction, since a slot that was never rendered before is
  //     indistinguishable from a brand-new one.
  const [exitingTail, setExitingTail] = useState<
    {
      id: number;
      token: string;
      // Where this card was, in the LAST commit before it started
      // exiting — null only if no measurement was ever recorded for it
      // (shouldn't happen in practice, but falls back to the old
      // in-flow behavior below rather than snapping to 0,0).
      top: number | null;
      left: number | null;
    }[]
  >([]);
  const nextIdRef = useRef(0);
  const slotIdsRef = useRef<number[]>([]);
  // Starts empty (not `allTokens`) so the very first render is itself just
  // an "insert everything" diff — no separate mount-only case needed.
  const prevAllTokensRef = useRef<string[]>([]);
  // Set right before setInput() by anything that REPLACES the whole
  // progression atomically (currently just the suggestion pills below) —
  // never by typing. diffTokens deliberately treats any equal-length
  // change as a no-op, content or not (see its own comment/test: typing a
  // chord's name must never look like a remove+insert, or the exit/enter
  // animation would fire every keystroke). That's correct for typing, but
  // it means clicking a suggestion the SAME length as the current
  // progression (COMMON_PROGRESSIONS has both 3- and 4-chord entries)
  // silently swapped every card's content in place with no animation at
  // all, while a different-length pick correctly faded — an inconsistency
  // that only showed up on some clicks, not others. This flag lets the
  // diff block below skip diffTokens entirely for a real full replace,
  // regardless of whether the lengths happen to match.
  const forceFullReplaceRef = useRef(false);
  // Last measured {top,left} (relative to the grid container, in px) for
  // every currently-REAL (non-exiting) card, keyed by slot id — refreshed
  // after every commit by the measuring effect below. Read (never
  // written) during render, at the exact moment a card newly starts
  // exiting, to freeze its position — see gridRef's comment for why.
  const cardPositionsRef = useRef<Map<number, { top: number; left: number }>>(
    new Map(),
  );
  // Positioning context for exiting cards below (position: absolute is
  // resolved against the nearest positioned ancestor — without this, it'd
  // be the viewport, not the grid, and the frozen top/left offsets
  // computed relative to the grid would land in the wrong place entirely).
  const gridRef = useRef<HTMLDivElement>(null);

  // Synchronous, same-render adjustment (React's documented "adjusting
  // state while rendering" pattern) — NOT a useEffect. A shrink detected in
  // an effect fires one commit *after* the one that already removed the
  // card from `tokens`, so the card unmounts in commit 1 and a NEW node
  // remounts in commit 2 — no visible animation, plus a one-frame layout
  // blip as the grid loses and regains that slot. Doing it here means the
  // shrink and the exit-tail addition land in the SAME commit.
  if (prevAllTokensRef.current !== allTokens) {
    const prevAllTokens = prevAllTokensRef.current;
    prevAllTokensRef.current = allTokens;

    // Snapshot id -> token before mutating slotIdsRef, so any id that ends
    // up exiting (whether truly deleted or just pushed past CHORD_LIMIT)
    // can still recover what it used to show.
    const oldIdToToken = new Map(
      slotIdsRef.current.map((id, i) => [id, prevAllTokens[i]]),
    );
    const oldVisibleIds = slotIdsRef.current.slice(0, CHORD_LIMIT);

    const { at, removedCount, insertedCount } = forceFullReplaceRef.current
      ? { at: 0, removedCount: prevAllTokens.length, insertedCount: allTokens.length }
      : diffTokens(prevAllTokens, allTokens);
    forceFullReplaceRef.current = false;
    const insertedIds = Array.from(
      { length: insertedCount },
      () => nextIdRef.current++,
    );
    slotIdsRef.current.splice(at, removedCount, ...insertedIds);

    // Anything visible before that isn't visible now — whether it was
    // actually deleted, or just shifted past CHORD_LIMIT by an edit
    // elsewhere in the list — fades out the same way. (The reverse
    // direction, a chord newly sliding under the limit, needs no matching
    // check here: it just renders for the first time below and gets a
    // normal entrance.)
    const stillVisible = new Set(slotIdsRef.current.slice(0, CHORD_LIMIT));
    const newlyExiting = oldVisibleIds
      .filter((id) => !stillVisible.has(id))
      .map((id) => {
        // cardPositionsRef still holds the PREVIOUS commit's measurements
        // here — the measuring effect that would overwrite it for THIS
        // commit hasn't run yet (effects fire after render) — so this is
        // exactly "where the card was while it was still a real, in-flow
        // item," the correct freeze point for its exit.
        const pos = cardPositionsRef.current.get(id);
        return {
          id,
          token: oldIdToToken.get(id)!,
          top: pos?.top ?? null,
          left: pos?.left ?? null,
        };
      });

    if (newlyExiting.length > 0) {
      // Prepend (not replace) — a second chord leaving before the first
      // one finishes fading must not cut the first one's animation short;
      // both ride out on one shared, restarted timer (see the effect
      // below), at the cost of the earlier one getting a little bonus
      // fade time when they overlap.
      setExitingTail((tail) => [...newlyExiting, ...tail]);
    }
  }

  useEffect(() => {
    if (exitingTail.length === 0) return;
    const timer = setTimeout(
      () => setExitingTail([]),
      cssDurationMs("--chord-card-transition-duration"),
    );
    return () => clearTimeout(timer);
  }, [exitingTail]);

  // Re-measures every REAL card's position after every commit (no
  // dependency array — cheap for the handful of cards this grid ever
  // holds), so cardPositionsRef is always ready with an up-to-date freeze
  // point the instant something newly starts exiting (read during render,
  // in the diff block above). Runs via useLayoutEffect, not useEffect, so
  // it measures the DOM before the browser paints THIS commit — matters
  // when a card exits and a real card shifts into a new position in the
  // very same commit (e.g. deleting an earlier chord).
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const next = new Map<number, { top: number; left: number }>();
    grid
      .querySelectorAll<HTMLElement>(".chord-card:not(.chord-card-exiting)")
      .forEach((el) => {
        const id = Number(el.dataset.cardId);
        const rect = el.getBoundingClientRect();
        next.set(id, {
          top: rect.top - gridRect.top,
          left: rect.left - gridRect.left,
        });
      });
    cardPositionsRef.current = next;
  });

  // One combined array, mapped once below — see the key comment on the
  // card div for why this can't be two separate `.map()` calls. Filters
  // out any ghost whose id has already become visible again (a real slot
  // returning always wins) — possible in principle if a chord is pushed
  // past CHORD_LIMIT and then un-pushed again before its fade finishes.
  const visibleIds = new Set(slotIdsRef.current.slice(0, tokens.length));
  const cardSlots = [
    ...tokens.map((token, i) => ({
      id: slotIdsRef.current[i],
      token,
      exiting: false,
      top: null as number | null,
      left: null as number | null,
    })),
    ...exitingTail
      .filter((item) => !visibleIds.has(item.id))
      .map((item) => ({
        id: item.id,
        token: item.token,
        exiting: true,
        top: item.top,
        left: item.left,
      })),
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-4 px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-2">
        <label htmlFor="progression" className="text-sm font-medium">
          {t("home.progressionLabel")}
        </label>
        <ChordProgressionInput
          id="progression"
          value={input}
          onChange={setInput}
          placeholder={t("home.progressionHint")}
          chordLimit={CHORD_LIMIT}
        />
      </div>

      {/* Own centered block (sibling of the input box, not nested inside
          it) — this is what the difficulty toggle used to be on its own;
          grouping the suggestions link in with it must not pull it into
          the input box's left-aligned column. */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            className="text-xs text-muted underline transition hover-fine:text-accent active:scale-[0.97] duration-[160ms] ease-out"
          >
            {showSuggestions
              ? t("home.hideSuggestions")
              : t("home.showSuggestions")}
          </button>
          <button
            onClick={() => setShowDifficulty((v) => !v)}
            className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
          >
            {showDifficulty
              ? t("home.hideDifficulty")
              : t("home.showDifficulty")}
          </button>
        </div>
        {showSuggestions && (
          <div className="flex flex-wrap justify-center gap-2">
            {COMMON_PROGRESSIONS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  forceFullReplaceRef.current = true;
                  setInput(p);
                }}
                className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fixed-width columns (not flex-wrap) so every row gets the same
          column count — flex-wrap packs each row greedily by cumulative
          width, and the last bundle (no trailing badge) is narrower than
          the rest, so it would randomly squeeze an extra item onto its row
          while identical-width bundles elsewhere don't.

          Left-aligned (justify-start, grid's own default — not
          justify-center): with auto-fit's unused columns collapsed,
          `justify-center` treats the occupied columns as one block and
          re-centers it whenever the count changes. Since a card is kept
          mounted for --chord-card-transition-duration after being removed
          (see exitingTail above), that recompute fires TWICE for every
          deletion — once instantly
          when the real chord leaves `tokens`, and again ~280ms later when
          the ghost's own node finally leaves the DOM — each one snapping
          every other card sideways to stay centered. Left-aligned, adding
          or removing a card only ever grows/shrinks the row's right edge;
          nothing else has a "center" to recompute, so that second jump
          can't happen, and the actual fade reads clearly instead of being
          drowned out by it.

          Capped at 4 columns' width and centered like the input box above
          it — same `w-full max-w-[...]` pattern, so on a wide screen the
          row wraps at 4 chords instead of stretching edge-to-edge, and the
          first chord roughly lines up under the input bar rather than
          hugging the page's far-left edge. The row inside stays
          left-aligned (justify-start) — this box's own width is a
          constant, never derived from how many chords are currently
          rendered, so it can't reintroduce the re-centering jump above.

          Columns are sized to the 110px DIAGRAM alone, not the ~155px
          diagram+badge — the badge is positioned absolutely (see below),
          which takes it out of layout entirely. Sizing columns to include
          the badge (the original 190px) made the LAST card's column just
          as wide whether or not it actually had a badge — and it usually
          doesn't (nothing follows the final chord) — so the visible
          diagrams read as shifted left inside a box centered around
          invisible reserved badge-space that often wasn't there. Basing
          the box's width on diagrams alone means what's actually visible
          is what gets centered, at the cost of the badge sometimes poking
          out past the box's own edge (see the card's className below for
          why the gap has to be wide enough for that to not overlap the
          next chord instead). 4×110px + 3×48px gaps = 584px.

          max-w is TIERED (110/268/426/584px = 1/2/3/4 columns), not one
          fixed 584px cap — `auto-fit` only picks a column count based on
          how many 110+48px columns fit in the box's OWN width, and with a
          single smooth `max-w-[584px]`, `w-full` fills the box out to
          whatever's actually available on screen, which is rarely an
          exact multiple of a column's width. That mismatch is what caused
          the narrow-screen bug: at some widths the box is much wider than
          however many columns actually fit (a wide dead strip on the
          right), and at others it's just barely too narrow for one more
          column (the badge overflowing the box's own edge by a few px).
          Snapping max-w to an exact column-count width at each breakpoint
          means the box is NEVER wider than its content needs and NEVER so
          tight the badge has nowhere to go — each breakpoint is exactly
          110px/48px per gap, and the amount added on top (24px padding
          per side = 48px total, from the page wrapper's px-6) is why
          these don't line up with round numbers.

          relative: the positioning context for an exiting card's frozen
          top/left below (see cardPositionsRef) — without it, those
          offsets (computed relative to THIS box) would resolve against
          the viewport instead. */}
      <div
        ref={gridRef}
        className="relative w-full max-w-[110px] min-[316px]:max-w-[268px] min-[474px]:max-w-[426px] min-[632px]:max-w-[584px] mt-6 grid justify-start gap-x-12 gap-y-6 [grid-template-columns:repeat(auto-fit,110px)]"
      >
        {cardSlots.map((slot, i) => {
          const chord = findChord(slot.token);
          // Bundled with the OUTGOING transition (to i+1), not the incoming
          // one — so when the grid wraps to a new row, the badge stays
          // glued to the chord it's leaving, instead of drifting to the
          // start of the next row where it reads as unrelated.
          //
          // An exiting slot is a fading picture of a chord that's already
          // gone from the progression, not a real member of it anymore —
          // it must never appear on either side of a difficulty
          // computation. Without this guard, deleting a chord and
          // immediately retyping it (or just typing fast) would briefly
          // show a real transition badge computed against the ghost, e.g.
          // "C -> C" while the old C is still mid-fade — a difficulty
          // reading for a transition that doesn't exist in the current
          // progression, which this app's whole premise (an objective,
          // fixed fact about the CURRENT progression) can't afford even
          // for 280ms.
          const nextSlot = cardSlots[i + 1];
          const nextChord =
            nextSlot && !nextSlot.exiting
              ? findChord(nextSlot.token)
              : undefined;

          return (
            <div
              // Slot's permanent id (see slotIdsRef/cardSlots above), not
              // `${token}-${i}` or a plain index. Two things depend on
              // this: (1) the token's live text changes every keystroke
              // while it's being typed, so keying on the text would
              // remount the card (and re-play its entrance) on every
              // keystroke; (2) real and exiting cards MUST come from one
              // combined array mapped ONCE — React reconciles each
              // separate `.map()` call independently even when both
              // render into the same parent, so a key that "moves" from a
              // real-tokens map to a separate exiting-tail map is NOT
              // recognized as the same element and gets torn down and
              // rebuilt anyway (silently, since the content happens to
              // match) — which is what quietly broke the transition again
              // after the id scheme was first introduced.
              key={slot.id}
              // Read by the measuring effect above to key cardPositionsRef
              // — a plain index or the token text won't do (see the id
              // comment above for why identity has to survive both).
              data-card-id={slot.id}
              // relative: the badge below is positioned absolutely against
              // THIS card, not the grid — see the grid container's comment
              // for why (badge shouldn't count toward the column's width).
              className={`chord-card relative flex items-center justify-start ${
                slot.exiting ? "chord-card-exiting" : ""
              }`}
              // Exiting cards only: frozen at the exact spot they occupied
              // as a real, in-flow grid item the instant before they
              // started exiting (see cardPositionsRef/gridRef above) —
              // pulls them out of the grid's own layout entirely, so a
              // fading-out card no longer adds a phantom row that pushes
              // everything below it (the footer included) down for the
              // ~280ms it takes to fade. Falls back to the old in-flow
              // behavior if no measurement was ever recorded (shouldn't
              // happen, but beats snapping to the top-left corner).
              style={
                slot.exiting && slot.top !== null && slot.left !== null
                  ? {
                      position: "absolute",
                      top: slot.top,
                      left: slot.left,
                      width: 110,
                    }
                  : undefined
              }
            >
              {chord ? (
                <ChordDiagram chord={chord} />
              ) : (
                <ChordNotFound name={slot.token} />
              )}
              {showDifficulty && !slot.exiting && chord && nextChord && (
                // Absolute + left-full: starts right where the 110px
                // diagram ends, extending into the grid's own 48px column
                // gap (badge is ~37px wide, ml-2 leaves ~3px clearance
                // before the next chord's diagram) without adding to this
                // card's own width — see the grid container's comment.
                <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
                  <TransitionBadge
                    difficulty={transitionDifficulty(chord, nextChord)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
