import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Meyda from "meyda";
import {
  DETECTION,
  chordPitchClasses,
  chordTemplate,
  extractFrame,
  initialPlayAlong,
  matchesTarget,
  rankChords,
  stepPlayAlong,
  type MeydaLike,
  type PlayAlongState,
} from "./chordDetection.ts";
import type { Chord } from "./chords.ts";

// The real library, read from disk rather than imported via lib/chords.ts —
// that module pulls the JSON through the "@/*" alias, which plain
// `node --test` doesn't resolve. Using all of it (not a hand-picked few)
// is the point: a template change that confuses ANY two library chords
// should fail here.
const LIBRARY: Chord[] = JSON.parse(readFileSync(new URL("../data/chords.json", import.meta.url), "utf8"));
const byName = (name: string) => LIBRARY.find((c) => c.name === name)!;

const meyda = Meyda as unknown as MeydaLike;
const SAMPLE_RATE = 48000;
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

// Deterministic noise/phases, so a failure is reproducible run to run.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * A strummed chord, roughly: every sounding string with 6 harmonics, plus a
 * little noise. `amp` shapes the overtones so the tests don't only pass for
 * the one tone color the templates happen to resemble most.
 */
function synthChord(
  chord: Chord,
  size = DETECTION.fftSize,
  seed = 1,
  amp: (harmonic: number, string: number) => number = (h) => 0.1 / h,
): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(size);
  chord.frets.forEach((fret, string) => {
    if (fret < 0) return;
    const hz = 440 * 2 ** ((OPEN_STRINGS[string] + fret - 69) / 12);
    for (let h = 1; h <= 6; h++) {
      const phase = rand() * 2 * Math.PI;
      const a = amp(h, string);
      for (let n = 0; n < size; n++) out[n] += a * Math.sin((2 * Math.PI * hz * h * n) / SAMPLE_RATE + phase);
    }
  });
  for (let n = 0; n < size; n++) out[n] += (rand() - 0.5) * 0.01;
  return out;
}

test("pitch classes come from the frets in standard tuning", () => {
  const pcs = (name: string) => [...new Set(chordPitchClasses(byName(name)))].sort((a, b) => a - b);
  assert.deepEqual(pcs("G"), [2, 7, 11]); // D G B
  assert.deepEqual(pcs("C"), [0, 4, 7]); // C E G
  assert.deepEqual(pcs("D"), [2, 6, 9]); // D F# A
  assert.deepEqual(pcs("Am"), [0, 4, 9]); // C E A
});

test("templates weigh a note by how many strings ring it", () => {
  // No overtones (decay 0 -> only the fundamental counts): plain string counts.
  const g = chordTemplate(byName("G"), 0);
  assert.equal(g[7], 3); // G on low E, open G string, high e
  assert.equal(g[11], 2); // B on A string, open B
  assert.equal(g[2], 1); // open D
  assert.equal(g.reduce((a, b) => a + b), 6);
});

test("templates include each string's overtones", () => {
  // C's two E strings ring a B at their 3rd harmonic — the overtone that
  // made a played C look like Cmaj7 before templates accounted for it.
  assert.equal(chordTemplate(byName("C"), 0)[11], 0);
  assert.ok(chordTemplate(byName("C"))[11] > 0);
});

const top3 = (r: ReturnType<typeof rankChords>) => r.slice(0, 3).map((x) => `${x.chord.name} ${x.score.toFixed(3)}`).join(", ");

test("every library chord, strummed synthetically, ranks itself first through the real Meyda", () => {
  for (const chord of LIBRARY) {
    const ranked = rankChords(extractFrame(meyda, synthChord(chord), SAMPLE_RATE).chroma, LIBRARY);
    assert.equal(ranked[0].chord.name, chord.name, `${chord.name}: ${top3(ranked)}`);
    assert.ok(matchesTarget(ranked, chord), `${chord.name} not accepted as itself: ${top3(ranked)}`);
  }
});

// Chords one note away from another library chord, where that one note
// sits on a single string (Fmaj7 = Am + F, Am7 = C + A, Cmaj7 = Em + C...).
// When that string rings quieter than the rest, the extra note fades out of
// the chroma and the smaller chord genuinely matches better — no template
// can recover a note that's barely there. Known limit of chroma matching
// (an ML note-transcription upgrade like Basic Pitch is the fix, see
// FEATURES.md); kept in this list, not hidden, so a change that fixes or
// worsens it shows up here.
const ONE_NOTE_APART = new Set(["Fmaj7", "Am", "Am7", "Cmaj7", "Asus2"]);

test("each chord still counts as itself with a different tone color", () => {
  // Play-along only needs the played chord to be ACCEPTED as the target,
  // not to rank first (near-twins like Em/Em7 trade places).
  const bright = (h: number) => 0.1 * 0.8 ** (h - 1);
  for (const chord of LIBRARY) {
    const ranked = rankChords(extractFrame(meyda, synthChord(chord, DETECTION.fftSize, 11, bright), SAMPLE_RATE).chroma, LIBRARY);
    assert.ok(matchesTarget(ranked, chord), `bright ${chord.name}: ${top3(ranked)}`);
  }
  // Strings at uneven volumes, both ways round — closer to a real strum.
  const uneven = [
    (h: number, s: number) => (0.1 / h) * (s % 2 ? 1.4 : 0.6),
    (h: number, s: number) => (0.1 / h) * (s % 2 ? 0.6 : 1.4),
  ];
  for (const amp of uneven) {
    for (const seed of [5, 11, 99]) {
      for (const chord of LIBRARY.filter((c) => !ONE_NOTE_APART.has(c.name))) {
        const ranked = rankChords(extractFrame(meyda, synthChord(chord, DETECTION.fftSize, seed, amp), SAMPLE_RATE).chroma, LIBRARY);
        assert.ok(matchesTarget(ranked, chord), `uneven ${chord.name} (seed ${seed}): ${top3(ranked)}`);
      }
    }
  }
});

test("C and Am share two notes but are still told apart", () => {
  for (const [played, other] of [["C", "Am"], ["Am", "C"]]) {
    const ranked = rankChords(extractFrame(meyda, synthChord(byName(played)), SAMPLE_RATE).chroma, LIBRARY);
    assert.ok(!matchesTarget(ranked, byName(other)), `${other} accepted while ${played} was played`);
  }
});

test("switching buffer size rebuilds Meyda's chroma filter bank", () => {
  // Without the reset in extractFrame, the 16384 frame would be folded with
  // the bank cached for 8192 (Meyda then returns an all-zero chroma).
  extractFrame(meyda, synthChord(byName("C"), 8192), SAMPLE_RATE);
  const frame = extractFrame(meyda, synthChord(byName("G"), 16384), SAMPLE_RATE);
  assert.equal(rankChords(frame.chroma, LIBRARY)[0].chord.name, "G");
});

test("silence stays below the loudness gate", () => {
  const quiet = new Float32Array(DETECTION.fftSize);
  const rand = rng(7);
  for (let n = 0; n < quiet.length; n++) quiet[n] = (rand() - 0.5) * 0.002;
  assert.ok(extractFrame(meyda, quiet, SAMPLE_RATE).rms < DETECTION.minRms);
  assert.equal(extractFrame(meyda, new Float32Array(DETECTION.fftSize), SAMPLE_RATE).rms, 0);
});

// --- play-along state machine ---

const G = byName("G");
const D = byName("D");

/** Feeds frames 100 ms apart; returns the final state and every matched index in order. */
function run(targets: (Chord | undefined)[], frames: { matches: boolean; rms: number }[], start?: PlayAlongState) {
  let state = start ?? initialPlayAlong(targets);
  const matched: number[] = [];
  frames.forEach((f, i) => {
    const r = stepPlayAlong(state, targets, { ...f, now: i * 100 });
    state = r.state;
    if (r.matchedIndex !== null) matched.push(r.matchedIndex);
  });
  return { state, matched };
}
const hit = { matches: true, rms: 0.2 };
const miss = { matches: false, rms: 0.2 };

test("advances only after the match holds for holdMs", () => {
  const { state, matched } = run([G, D], [hit, hit, hit]);
  assert.deepEqual(matched, []); // 0 -> 200 ms: not yet 300
  assert.equal(state.index, 0);
  assert.deepEqual(run([G, D], [hit, hit, hit, hit]).matched, [0]);
});

test("a match that breaks off before holdMs starts over", () => {
  assert.deepEqual(run([G, D], [hit, hit, miss, hit, hit, hit]).matched, []);
});

test("loops back to the start and clears what was played", () => {
  const { state, matched } = run([G, D], [hit, hit, hit, hit, hit, hit, hit, hit]);
  assert.deepEqual(matched, [0, 1]);
  assert.equal(state.index, 0);
  assert.deepEqual(state.played, []);
});

test("records played chords within a pass", () => {
  const { state } = run([G, D, byName("Em")], [hit, hit, hit, hit]);
  assert.equal(state.index, 1);
  assert.deepEqual(state.played, [0]);
});

test("unknown chords are skipped, and an all-unknown progression can't start", () => {
  assert.equal(initialPlayAlong([undefined, G]).index, 1);
  const { state, matched } = run([undefined, G, undefined, D], [hit, hit, hit, hit]);
  assert.deepEqual(matched, [1]);
  assert.equal(state.index, 3);
  assert.equal(initialPlayAlong([undefined, undefined]).index, -1);
  assert.deepEqual(run([undefined], [hit, hit, hit, hit]).matched, []);
});

test("a repeated chord needs a fresh strum, not the same one still ringing", () => {
  const decaying = [0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.09, 0.08].map((rms) => ({ matches: true, rms }));
  // G G: the first G counts at 300 ms, then the second G must not count off the same decay.
  assert.deepEqual(run([G, G, D], [...decaying]).matched, [0]);
  // A new strum (loudness jumps well above the decayed floor) re-arms it.
  const restrum = [0.25, 0.25, 0.25, 0.25].map((rms) => ({ matches: true, rms }));
  assert.deepEqual(run([G, G, D], [...decaying, ...restrum]).matched, [0, 1]);
});
