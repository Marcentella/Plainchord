// Relative imports only (no "@/*" alias) — this file is exercised directly by
// `node --test`, which can't resolve that alias (see lib/chordRank.ts's own
// note on the same constraint).
import type { Tab, TabBeat, TechniqueSymbol } from "./tab.ts";

// ponytail: 300 picked by eye as "clearly more than any real song section
// needs to render at once"; revisit after measuring render cost on a
// mid-range phone with a real long paste.
export const MAX_BEATS = 300;

export type ParseTabResult =
  | {
      ok: true;
      tab: Tab;
      /** Set when the parsed tab was longer than MAX_BEATS — the original beat count. */
      truncatedFrom?: number;
      /** Count of characters that looked like tab content but matched no known symbol (e.g. "r" for a bend release). */
      ignoredChars: number;
      /** Count of staff-line runs that weren't exactly 6 lines (7-string, bass, or a stray line). */
      skippedBlocks: number;
    }
  | {
      ok: false;
      /** No staff-line-shaped content was found at all. */
      error: "noStaff";
    }
  | {
      ok: false;
      /** Staff-line-shaped content was found, but no run of it was exactly 6 lines. */
      error: "wrongStringCount";
    };

// A line qualifies as tab staff content once its label (if any) is stripped:
// only tab-alphabet characters, and at least 2 dashes so a stray "|" or a
// short non-tab fragment doesn't false-positive. Two dashes rather than one
// consecutive "--" run, since tight notation ("0-2-3-5") spaces notes with
// single dashes, not a run of them.
const STAFF_CONTENT_RE = /^[-0-9|hpbrsxXtT~/\\()<>*.\s]*$/;

function isStaffContent(s: string): boolean {
  return (s.match(/-/g)?.length ?? 0) >= 2 && STAFF_CONTENT_RE.test(s);
}

// Tried in order; the first one whose stripped remainder qualifies wins.
// Labels vary a lot between sources: "e|", "E |", "B:", "1|", or none at all.
const LABEL_PATTERNS = [
  /^\s*[A-Ga-g](?:#|b)?\s*[|:]\s*/,
  /^\s*[1-6]\s*[|:]\s*/,
  /^\s*[A-Ga-g](?:#|b)?(?=[\s-])/,
];

/** Strips a line's own label and returns the remainder, or null if the line isn't a staff line at all. */
function toStaffLine(line: string): string | null {
  if (isStaffContent(line)) return line;
  for (const re of LABEL_PATTERNS) {
    const m = line.match(re);
    if (m) {
      const rest = line.slice(m[0].length);
      if (isStaffContent(rest)) return rest;
    }
  }
  return null;
}

// Letters immediately before a fret number describe the transition INTO that
// note; all normalize to one of these three ("\\" and "s" are alternate
// slide spellings some sources use).
const CONNECTOR_MAP: Record<string, TechniqueSymbol> = {
  h: "h",
  p: "p",
  "/": "/",
  "\\": "/",
  s: "/",
  t: "T",
  T: "T",
};

type LineNote = {
  string: number;
  // Raw character index in the (label-stripped) line — used only by
  // applyAnnotation and the bar-column comparison below, both of which
  // compare against OTHER un-tokenized text (an annotation line's own
  // regex match, findBarColumns' raw "|" positions) and so need to stay in
  // that same raw coordinate space.
  startCol: number;
  endCol: number;
  // Logical column — advances only for a dash or an actual struck note
  // (digit run, dead note); a technique annotation (h/p//, a bend's "b9",
  // vibrato's "~~~") contributes zero width here. This is what
  // clusterIntoBeats groups on, so a technique inserted on one line can't
  // drift that line's notes out of step with the other five (see
  // lib/parseTab.test.ts's drift tests for why this split from startCol).
  col: number;
  colEnd: number;
  fret: number | null;
  techniques: TechniqueSymbol[];
  bendTo?: number;
};

/** Scans one label-stripped staff line into its notes, left to right. */
function tokenizeLine(line: string): { notes: Omit<LineNote, "string">[]; ignoredChars: number } {
  const notes: Omit<LineNote, "string">[] = [];
  let ignoredChars = 0;
  let pendingConnector: TechniqueSymbol | undefined;
  let i = 0; // raw scan position
  let col = 0; // logical column

  while (i < line.length) {
    const ch = line[i];

    if (ch === "-" || ch === "|" || /\s/.test(ch)) {
      i++;
      col++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const startCol = i;
      const startLogical = col;
      let end = i;
      while (end < line.length && /[0-9]/.test(line[end])) end++;
      col += end - i; // only the fret's own digits claim real column width
      const fret = parseInt(line.slice(i, end), 10);
      const techniques: TechniqueSymbol[] = [];
      if (pendingConnector) {
        techniques.push(pendingConnector);
        pendingConnector = undefined;
      }
      i = end;

      let bendTo: number | undefined;
      if (line[i] === "b" && /[0-9]/.test(line[i + 1] ?? "")) {
        techniques.push("b");
        let k = i + 1;
        while (k < line.length && /[0-9]/.test(line[k])) k++;
        bendTo = parseInt(line.slice(i + 1, k), 10);
        i = k; // consumes raw chars, zero logical width — a bend's target
        // isn't a separately-struck note, it's metadata on this one.
      }
      if (line[i] === "~") {
        techniques.push("~");
        while (line[i] === "~") i++; // zero logical width, same reasoning
      }

      notes.push({ startCol, endCol: i, col: startLogical, colEnd: col, fret, techniques, bendTo });
      continue;
    }

    if (ch === "x" || ch === "X") {
      const techniques: TechniqueSymbol[] = ["x"];
      if (pendingConnector) {
        techniques.push(pendingConnector);
        pendingConnector = undefined;
      }
      notes.push({ startCol: i, endCol: i + 1, col, colEnd: col + 1, fret: null, techniques });
      i++;
      col++;
      continue;
    }

    if (ch in CONNECTOR_MAP) {
      pendingConnector = CONNECTOR_MAP[ch];
      i++; // zero logical width
      continue;
    }

    // Unrecognized but tab-alphabet char: bend release ("r"), grace-note/
    // ornament marks ("(", ")", "<", ">", "*", "."). The note itself was
    // already captured; this is just an articulation we don't model yet.
    // Zero logical width, same as any other annotation mark.
    ignoredChars++;
    i++;
  }

  return { notes, ignoredChars };
}

/** Columns where every line in the block has "|" at once — a bar line. */
function findBarColumns(lines: string[]): number[] {
  const minLen = Math.min(...lines.map((l) => l.length));
  const cols: number[] = [];
  for (let c = 0; c < minLen; c++) {
    if (lines.every((l) => l[c] === "|")) cols.push(c);
  }
  return cols;
}

/** Applies a "PM------" / "PH------" annotation line to every note it spans. */
function applyAnnotation(notes: Omit<LineNote, "string">[], annotation: string | undefined) {
  if (!annotation) return;
  const re = /PM|PH/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(annotation))) {
    const symbol = m[0] as "PM" | "PH";
    let end = m.index + m[0].length;
    while (end < annotation.length && annotation[end] !== " ") end++;
    for (const note of notes) {
      if (note.startCol < end && note.endCol > m.index) note.techniques.push(symbol);
    }
  }
}

/**
 * Groups overlapping-column notes (across strings) into simultaneous beats.
 * Grouped by the logical column (col/colEnd — real notes and dashes only),
 * not the raw character index, so a technique annotation on just one line
 * can't drift that line's notes out of step with the other five.
 */
function clusterIntoBeats(allNotes: LineNote[]): LineNote[][] {
  const sorted = [...allNotes].sort((a, b) => a.col - b.col);
  const clusters: LineNote[][] = [];
  let clusterEnd = -Infinity;
  for (const note of sorted) {
    if (clusters.length && note.col < clusterEnd) {
      clusters[clusters.length - 1].push(note);
      clusterEnd = Math.max(clusterEnd, note.colEnd);
    } else {
      clusters.push([note]);
      clusterEnd = note.colEnd;
    }
  }
  return clusters;
}

export function parseTab(text: string): ParseTabResult {
  const rawLines = text.replace(/[–—]/g, "-").split(/\r\n|\r|\n/);
  const staffByLine = rawLines.map(toStaffLine);

  const blocks: string[][] = [];
  const annotations: (string | undefined)[] = [];
  let skippedBlocks = 0;

  let i = 0;
  while (i < rawLines.length) {
    if (staffByLine[i] == null) {
      i++;
      continue;
    }
    const runStart = i;
    while (i < rawLines.length && staffByLine[i] != null) i++;
    const run = staffByLine.slice(runStart, i) as string[];

    if (run.length === 6) {
      const annoLine = runStart > 0 && staffByLine[runStart - 1] == null ? rawLines[runStart - 1] : undefined;
      blocks.push(run);
      annotations.push(annoLine && /PM|PH/.test(annoLine) ? annoLine : undefined);
    } else {
      skippedBlocks++;
    }
  }

  if (blocks.length === 0) {
    return { ok: false, error: skippedBlocks > 0 ? "wrongStringCount" : "noStaff" };
  }

  let ignoredChars = 0;
  let runningBar = 0;
  const allBeats: TabBeat[] = [];

  blocks.forEach((block, blockIdx) => {
    const barCols = findBarColumns(block);
    const allNotes: LineNote[] = [];

    // Top line is the highest string (index 5, high e); bottom is index 0.
    block.forEach((lineStr, lineIdx) => {
      const stringIndex = 5 - lineIdx;
      const { notes, ignoredChars: ig } = tokenizeLine(lineStr);
      ignoredChars += ig;
      applyAnnotation(notes, annotations[blockIdx]);
      for (const note of notes) allNotes.push({ ...note, string: stringIndex });
    });

    for (const cluster of clusterIntoBeats(allNotes)) {
      const startCol = Math.min(...cluster.map((n) => n.startCol));
      const barsBefore = barCols.filter((c) => c < startCol).length;
      allBeats.push({
        position: allBeats.length,
        bar: runningBar + barsBefore,
        notes: cluster.map(({ string, fret, techniques, bendTo }) =>
          bendTo != null ? { string, fret, techniques, bendTo } : { string, fret, techniques },
        ),
      });
    }

    runningBar += barCols.length + 1; // the next block always starts a fresh bar
  });

  const truncated = allBeats.length > MAX_BEATS;
  return {
    ok: true,
    tab: { beats: truncated ? allBeats.slice(0, MAX_BEATS) : allBeats },
    truncatedFrom: truncated ? allBeats.length : undefined,
    ignoredChars,
    skippedBlocks,
  };
}
