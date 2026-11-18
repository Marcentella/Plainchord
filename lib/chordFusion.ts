/**
 * One verdict per strum from the two sensors of the camera check
 * (components/CameraCheckModal.tsx). Pure, tested under node:test.
 *
 * They fail in opposite ways, which is the point of joining them: the camera
 * sees where the fingers are but not whether they press hard enough or brush
 * a neighbouring string; the mic hears whether the chord rang but not which
 * fingers made it. So "fingers right, sound wrong" says something neither
 * can say alone: the shape is right and the problem is pressure or a muted
 * string.
 */
import type { Chord } from "./chords.ts";
import type { FingerCheck, FingerPosition } from "./chordFingerCheck.ts";
import type { StringResult } from "./stringCheck.ts";

/**
 * What the camera saw at the strum's start:
 * - right: every finger the chord uses is where the diagram puts it
 * - wrong: at least one finger the camera sees is somewhere else
 * - unsure: none seen wrong, but some aren't seen at all
 * - off: no camera reading (not calibrated, or the camera is off)
 */
export type CameraState = "right" | "wrong" | "unsure" | "off";

export function cameraState(checks: FingerCheck[] | null): CameraState {
  if (!checks) return "off";
  const used = checks.filter((c) => c.status !== "unused");
  if (used.length === 0) return "off";
  // A finger seen in the wrong place outweighs one not seen: it's a definite mistake.
  if (used.some((c) => c.status === "wrongString" || c.status === "wrongFret" || c.status === "elsewhere")) return "wrong";
  return used.every((c) => c.status === "ok") ? "right" : "unsure";
}

/**
 * A string that didn't ring the way the chord asks (lib/stringCheck.ts),
 * tied to the finger most likely behind it. `string`: 0-5, low E first.
 * - open: fretted, but rang open → its own finger isn't pressing
 * - missing: didn't ring → if fretted, its finger; if open, the finger
 *   the camera saw leaning on it (the classic: finger 2 of a C muting the G)
 * - ringsButShouldnt: an x string was strummed
 */
export type StringIssue = { string: number; kind: "open" | "missing" | "ringsButShouldnt"; finger: number | null };

/**
 * How far (in string spacings) a fingertip may sit from an open string and
 * still be named as the one muting it. A bit over one spacing: the usual
 * culprit presses the neighbouring string and leans over, and its tip may
 * still read as sitting on its own string. The nearest one wins.
 */
const MUTING_REACH = 1.25;

export function stringIssues(chord: Chord, results: StringResult[], positions: FingerPosition[] | null): StringIssue[] {
  return results.flatMap((result, s): StringIssue[] => {
    if (result === "ringsButShouldnt") return [{ string: s, kind: result, finger: null }];
    if (result !== "open" && result !== "missing") return [];
    if (chord.frets[s] > 0) return [{ string: s, kind: result, finger: chord.fingers[s] || null }];
    // An open string that didn't ring: whichever fingertip is nearest it, within reach.
    let finger: number | null = null;
    let best = MUTING_REACH;
    positions?.forEach((p, i) => {
      if (p && Math.abs(p.string - s) < best) {
        best = Math.abs(p.string - s);
        finger = i + 1;
      }
    });
    return [{ string: s, kind: result, finger }];
  });
}

export type Verdict =
  /** Both agree it's right. */
  | { kind: "correct" }
  /** Shape right, sound wrong: pressure, or a finger muting a string; `issues` say which, when the strings could be told apart. */
  | { kind: "pressOrMute"; issues: StringIssue[] }
  /** Sound right, shape differs from the diagram: another fingering, or a camera misread. */
  | { kind: "soundsRight" }
  /** Both wrong: the first finger to move. */
  | { kind: "fixFingers"; finger: FingerCheck }
  /** The camera can't judge (off or unsure): only the sound is. */
  | { kind: "soundOnly"; matches: boolean; camera: "off" | "unsure"; issues: StringIssue[] };

/**
 * The sound counts as right when the whole chord matches AND no string was
 * flagged: a C with its B string open still matches C as a chord (it's a
 * Cmaj7, a near-twin the detector lets through on purpose), but the string
 * check catches it.
 */
export function fuseStrum(checks: FingerCheck[] | null, audio: { matches: boolean }, issues: StringIssue[] = []): Verdict {
  const camera = cameraState(checks);
  const soundRight = audio.matches && issues.length === 0;
  if (camera === "off" || camera === "unsure") return { kind: "soundOnly", matches: soundRight, camera, issues };
  if (camera === "right") return soundRight ? { kind: "correct" } : { kind: "pressOrMute", issues };
  if (soundRight) return { kind: "soundsRight" };
  const finger = checks!.find((c) => c.status === "wrongString" || c.status === "wrongFret" || c.status === "elsewhere")!;
  return { kind: "fixFingers", finger };
}
