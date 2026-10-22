"use client";

import { RotateCw } from "lucide-react";
import ChordDiagram from "@/components/ChordDiagram";
import { FRETBOARD, FretboardGrid } from "@/components/Fretboard";
import TabRenderer, { tabStringY } from "@/components/TabRenderer";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord } from "@/lib/chords";
import type { GuideVisual as Visual } from "@/lib/guide";
import { formatNote } from "@/lib/notation";
import { parseTab } from "@/lib/parseTab";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { useT } from "@/i18n/LocaleProvider";
import type { TKey } from "@/i18n/t";

// Every drawing here is line art in currentColor (plus --accent for the one
// thing each figure is about), so it follows theme and palette the same way
// ChordDiagram does. Labels go through t(); article prose lives in
// data/guide.json.

// Open strings low E -> high e, same order as Chord.frets.
const OPEN_NOTES = ["E", "A", "D", "G", "B", "E"];
const OCTAVES = [2, 2, 3, 3, 3, 4];
const STRING_KEYS = [6, 5, 4, 3, 2, 1].map((n) => `guide.fig.string${n}` as TKey);

export default function GuideVisual({ visual }: { visual: Visual }) {
  switch (visual.visual) {
    case "guitar-parts":
      return <GuitarParts />;
    case "strings":
      return <Strings octaves={visual.octaves} />;
    case "frets":
      return <Frets />;
    case "note-names":
      return <NoteNames />;
    case "hand":
      return <Hand />;
    case "orientation":
      return <Orientation />;
    case "chord": {
      const chord = findChord(visual.chord);
      return chord ? (
        <div className="flex justify-center">
          <ChordDiagram chord={chord} labels />
        </div>
      ) : null;
    }
    case "tab":
      return <TabExample />;
    case "difficulty":
      return <DifficultyPairs pairs={visual.pairs} />;
  }
}

function Caption({ children }: { children: React.ReactNode }) {
  return <figcaption className="text-center text-sm text-muted">{children}</figcaption>;
}

function GuitarParts() {
  const t = useT();
  // Leader lines from each label to the part it names: [label key, label x,
  // label y, point x, point y, anchor]. Labels above the guitar sit at y=14,
  // below at y=168. The outermost ones are pinned to the drawing's edge
  // (start/end) instead of centered, so a longer translation ("Tuning
  // pegs") grows inward instead of off the side; their leader drops
  // straight down from the point.
  const labels: [TKey, number, number, number, number, ("start" | "end")?][] = [
    ["guide.fig.pegs", 2, 14, 32, 44, "start"],
    ["guide.fig.nut", 102, 14, 62, 62],
    ["guide.fig.frets", 166, 14, 166, 62],
    ["guide.fig.soundhole", 248, 14, 248, 60],
    ["guide.fig.headstock", 2, 168, 32, 104, "start"],
    ["guide.fig.neck", 130, 168, 130, 88],
    ["guide.fig.body", 230, 168, 230, 124],
    ["guide.fig.bridge", 358, 168, 312, 92, "end"],
  ];
  const frets = [80, 97, 113, 128, 142, 155, 167, 178, 188];
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 360 176" className="w-full text-foreground" role="img" aria-label={t("guide.fig.partsAlt")}>
        <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
          {/* headstock */}
          <path d="M8,54 L58,62 L58,88 L8,96 Z" />
          {/* body: upper bout, waist, lower bout */}
          <path d="M200,62 C200,40 214,30 236,30 C254,30 262,40 272,40 C284,40 296,24 322,24 C344,24 354,48 354,75 C354,102 344,126 322,126 C296,126 284,110 272,110 C262,110 254,120 236,120 C214,120 200,110 200,88" />
          {/* neck */}
          <path d="M62,64 L200,64 M62,86 L200,86" />
          {/* soundhole and bridge */}
          <circle cx={248} cy={75} r={14} />
          <rect x={306} y={62} width={12} height={26} rx={2} />
        </g>
        {/* pegs */}
        {[18, 32, 46].map((x) => (
          <g key={x} fill="currentColor">
            <circle cx={x} cy={x === 18 ? 50 : x === 32 ? 52 : 54} r={3.5} />
            <circle cx={x} cy={x === 18 ? 100 : x === 32 ? 98 : 96} r={3.5} />
          </g>
        ))}
        {/* nut, in accent: it's the thick top line of every chord diagram */}
        <rect x={58} y={62} width={4} height={26} fill="var(--accent)" />
        {frets.map((x) => (
          <line key={x} x1={x} y1={64} x2={x} y2={86} stroke="currentColor" strokeWidth={1} />
        ))}
        {[67, 71, 74, 77, 80, 83].map((y, i) => (
          <line key={y} x1={20} y1={y} x2={312} y2={y} stroke="currentColor" strokeWidth={1.1 - i * 0.12} opacity={0.7} />
        ))}
        <g fontSize={13} textAnchor="middle" style={{ fill: "var(--foreground)" }}>
          {labels.map(([key, lx, ly, px, py, anchor]) => (
            <g key={key}>
              <line
                x1={anchor ? px : lx}
                y1={ly < py ? ly + 4 : ly - 13}
                x2={px}
                y2={py}
                stroke="var(--muted)"
                strokeWidth={0.75}
              />
              <text x={lx} y={ly} textAnchor={anchor}>
                {t(key)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </figure>
  );
}

/** The six strings as you see them while playing: 6th on top, thickest. */
function Strings({ octaves = false }: { octaves?: boolean }) {
  const t = useT();
  const ROW = 26;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 340 ${ROW * 6 + 8}`}
        className="w-full text-foreground"
        role="img"
        aria-label={t("guide.fig.stringsAlt")}
      >
        {OPEN_NOTES.map((note, i) => {
          const y = 16 + i * ROW;
          // American first (what chord sheets and tabs use almost everywhere),
          // the Latin name after it in muted. The low/high word is a template
          // because its order differs: "low E" vs "E grave".
          const american = octaves ? `${note}${OCTAVES[i]}` : note;
          const name =
            i === 0
              ? t("guide.fig.lowNote", { note: american })
              : i === 5
                ? t("guide.fig.highNote", { note: american })
                : american;
          const latin = formatNote(note, "latin");
          return (
            <g key={i}>
              <text x={4} y={y + 4} fontSize={12} fontWeight="bold" style={{ fill: i === 0 ? "var(--accent)" : "var(--foreground)" }}>
                {t(STRING_KEYS[i])}
              </text>
              <line
                x1={36}
                y1={y}
                x2={200}
                y2={y}
                stroke={i === 0 ? "var(--accent)" : "currentColor"}
                strokeWidth={3.2 - i * 0.45}
                strokeLinecap="round"
              />
              <text x={212} y={y + 4} fontSize={12} style={{ fill: "var(--foreground)" }}>
                {name}
                <tspan style={{ fill: "var(--muted)" }}>{` · ${latin}`}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <Caption>{t("guide.fig.stringsCaption")}</Caption>
    </figure>
  );
}

/** A stretch of neck, nut on the left: fret spaces numbered, one finger just behind fret wire 3. */
function Frets() {
  const t = useT();
  const NUT_X = 14;
  const SPACE = 76;
  const TOP = 48;
  const GAP = 13;
  const bottom = TOP + GAP * 5;
  const wireX = (n: number) => NUT_X + n * SPACE;
  const dotX = wireX(3) - 12;
  const dotY = TOP + GAP;
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 340 150" className="w-full text-foreground" role="img" aria-label={t("guide.fig.fretsAlt")}>
        {Array.from({ length: 6 }, (_, i) => (
          <line
            key={i}
            x1={NUT_X}
            y1={TOP + GAP * i}
            x2={338}
            y2={TOP + GAP * i}
            stroke="currentColor"
            strokeWidth={1.6 - i * 0.2}
          />
        ))}
        <rect x={NUT_X - 5} y={TOP - 3} width={6} height={GAP * 5 + 6} fill="currentColor" />
        {[1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line x1={wireX(n)} y1={TOP - 3} x2={wireX(n)} y2={bottom + 3} stroke="currentColor" strokeWidth={2} opacity={0.6} />
            <text
              x={wireX(n) - SPACE / 2}
              y={bottom + 26}
              fontSize={14}
              textAnchor="middle"
              fontWeight={n === 3 ? "bold" : undefined}
              style={{ fill: n === 3 ? "var(--accent)" : "var(--foreground)" }}
            >
              {t("guide.fig.fret", { n: String(n) })}
            </text>
          </g>
        ))}
        <text x={NUT_X - 6} y={TOP - 14} fontSize={13} style={{ fill: "var(--muted)" }}>
          {t("guide.fig.nut")}
        </text>
        <circle cx={dotX} cy={dotY} r={8} fill="var(--accent)" />
        <line x1={dotX} y1={dotY - 10} x2={dotX} y2={22} stroke="var(--muted)" strokeWidth={0.75} />
        <text x={dotX} y={16} fontSize={13} textAnchor="middle" style={{ fill: "var(--foreground)" }}>
          {t("guide.fig.behindFret")}
        </text>
      </svg>
    </figure>
  );
}

/** Do = C … Si = B, with La = A (the mnemonic's anchor) in accent. */
function NoteNames() {
  const t = useT();
  const notes = ["C", "D", "E", "F", "G", "A", "B"];
  return (
    <figure>
      <table className="mx-auto border-separate border-spacing-x-1 text-center">
        <tbody>
          {(["latin", "american"] as const).map((notation) => (
            <tr key={notation}>
              <th scope="row" className="pr-2 text-right text-xs font-normal text-muted">
                {t(notation === "latin" ? "guide.fig.latin" : "guide.fig.american")}
              </th>
              {notes.map((note) => (
                <td
                  key={note}
                  className={`w-10 py-1 text-base ${note === "A" ? "font-semibold text-accent" : ""}`}
                >
                  {formatNote(note, notation)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * Left hand seen from the back, fingers up: pinky on the left, thumb on the
 * right. Numbers sit in accent dots like a diagram's finger dots, so the
 * hand reads as the key to them.
 */
function Hand() {
  const t = useT();
  // [x center, fingertip y, number]; every finger runs down under the palm.
  const fingers: [number, number, number][] = [
    [64, 70, 4],
    [92, 36, 3],
    [120, 24, 2],
    [148, 38, 1],
  ];
  const W = 25;
  return (
    <figure className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
      <svg viewBox="0 0 230 250" width={200} className="text-foreground" role="img" aria-label={t("guide.fig.handAlt")}>
        <g stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" style={{ fill: "var(--background)" }}>
          {fingers.map(([x, top]) => (
            <rect key={x} x={x - W / 2} y={top} width={W} height={150 - top} rx={W / 2} />
          ))}
          {/* thumb: drawn before the palm, so the palm covers its base */}
          <rect x={141} y={112} width={28} height={100} rx={14} transform="rotate(40 155 212)" />
          <path d="M48,132 C48,124 54,120 62,120 L160,120 C168,120 172,126 172,136 L170,196 C168,222 148,238 112,238 C76,238 52,222 50,196 Z" />
        </g>
        {fingers.map(([x, top, n]) => (
          <g key={n}>
            <circle cx={x} cy={top + 15} r={9.5} fill="var(--accent)" />
            <text x={x} y={top + 19} fontSize={12} fontWeight="bold" textAnchor="middle" style={{ fill: "var(--dot-text)" }}>
              {n}
            </text>
          </g>
        ))}
        <circle cx={211} cy={146} r={9.5} style={{ fill: "var(--background)" }} stroke="var(--accent)" strokeWidth={1.5} />
        <text x={211} y={150} fontSize={12} fontWeight="bold" textAnchor="middle" style={{ fill: "var(--accent)" }}>
          {t("guide.fig.thumbLetter")}
        </text>
      </svg>
      <div className="flex flex-col gap-3">
        <ol className="flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-dot-text">{n}</span>
              {t(`guide.fig.finger${n}` as TKey)}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full border-[1.5px] border-accent text-xs font-bold text-accent">
              {t("guide.fig.thumbLetter")}
            </span>
            {t("guide.fig.thumb")}
          </li>
        </ol>
        <p className="max-w-52 text-sm text-muted">{t("guide.fig.handCaption")}</p>
      </div>
    </figure>
  );
}

/**
 * The one idea beginners trip on: the diagram is the guitar stood up and
 * facing you. Same 6th string in accent on both sides, so the eye follows
 * it from "on top" to "on the left". Two still frames, no animation — it
 * reads the same with reduced motion and costs nothing.
 */
function Orientation() {
  const t = useT();
  const { W, H, NUT_Y, STRING_X, FRETS, FRET_H } = FRETBOARD;
  return (
    <figure className="flex flex-col gap-3" role="img" aria-label={t("guide.fig.orientationAlt")}>
      <div className="flex items-end justify-center gap-3 sm:gap-6" aria-hidden>
        <div className="flex flex-col items-center gap-2">
          {/* lying down, headstock left, 6th string on top */}
          <svg viewBox="0 0 150 110" width={140} className="text-foreground">
            <path d="M4,28 L26,34 L26,76 L4,82 Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <rect x={26} y={34} width={4} height={42} fill="currentColor" />
            {[60, 88, 114, 138].map((x) => (
              <line key={x} x1={x} y1={34} x2={x} y2={76} stroke="currentColor" strokeWidth={1} />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line
                key={i}
                x1={30}
                y1={38 + i * 6.8}
                x2={148}
                y2={38 + i * 6.8}
                stroke={i === 0 ? "var(--accent)" : "currentColor"}
                strokeWidth={i === 0 ? 3 : 1.8 - i * 0.2}
              />
            ))}
            <text x={88} y={24} fontSize={11} fontWeight="bold" textAnchor="middle" style={{ fill: "var(--accent)" }}>
              {t("guide.fig.string6")}
            </text>
            <text x={88} y={96} fontSize={11} textAnchor="middle" style={{ fill: "var(--muted)" }}>
              {t("guide.fig.string1")}
            </text>
          </svg>
          <p className="max-w-36 text-center text-xs text-muted">{t("guide.fig.playingView")}</p>
        </div>
        <RotateCw size={20} className="mb-16 shrink-0 text-muted" />
        <div className="flex flex-col items-center gap-2">
          {/* standing up, facing you: exactly a chord diagram's grid */}
          <svg viewBox={`0 0 ${W} ${H - 20}`} width={110} className="text-foreground">
            <FretboardGrid hideString={0} />
            <line x1={STRING_X[0]} y1={NUT_Y} x2={STRING_X[0]} y2={NUT_Y + FRETS * FRET_H} stroke="var(--accent)" strokeWidth={3} />
            <text x={STRING_X[0]} y={NUT_Y + FRETS * FRET_H + 16} fontSize={11} fontWeight="bold" textAnchor="middle" style={{ fill: "var(--accent)" }}>
              {t("guide.fig.string6")}
            </text>
            <text x={STRING_X[5]} y={NUT_Y + FRETS * FRET_H + 16} fontSize={11} textAnchor="middle" style={{ fill: "var(--muted)" }}>
              {t("guide.fig.string1")}
            </text>
          </svg>
          <p className="max-w-36 text-center text-xs text-muted">{t("guide.fig.diagramView")}</p>
        </div>
      </div>
      <Caption>{t("guide.fig.rotate")}</Caption>
    </figure>
  );
}

// PlainChord's own exercise (a C arpeggio), not a song: the opening 3 and 0
// are stacked to show "played together", the rest walks up one at a time.
// Four beats, so it renders as a single bar.
const EXAMPLE_TAB = `e|-------0-|
B|-----1---|
G|-0-------|
D|---2-----|
A|-3-------|
E|---------|`;

const exampleTab = parseTab(EXAMPLE_TAB);
const TAB_LETTERS = ["E", "A", "D", "G", "B", "e"];

function TabExample() {
  const t = useT();
  if (!exampleTab.ok) return null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex justify-center">
        {/* String letters beside the staff, at the renderer's own line heights. */}
        <svg width={16} height={tabStringY(0) + 10} aria-hidden className="shrink-0">
          {TAB_LETTERS.map((letter, i) => (
            <text key={i} x={8} y={tabStringY(i) + 4} fontSize={11} fontWeight="bold" textAnchor="middle" style={{ fill: "var(--muted)" }}>
              {letter}
            </text>
          ))}
        </svg>
        <div>
          <TabRenderer tab={exampleTab.tab} />
        </div>
      </div>
      <Caption>{t("guide.fig.tabCaption")}</Caption>
    </figure>
  );
}

function DifficultyPairs({ pairs }: { pairs: [string, string][] }) {
  return (
    <figure className="flex flex-col items-center gap-4">
      {pairs.map(([a, b]) => {
        const from = findChord(a);
        const to = findChord(b);
        if (!from || !to) return null;
        return (
          <div key={`${a}-${b}`} className="flex items-center gap-3">
            <ChordDiagram chord={from} />
            <div className="w-14">
              <TransitionBadge difficulty={transitionDifficulty(from, to)} />
            </div>
            <ChordDiagram chord={to} />
          </div>
        );
      })}
    </figure>
  );
}
