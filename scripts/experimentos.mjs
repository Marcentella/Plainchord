// Reproduces the design experiments quoted in the U2 report (PE-01 to PE-05 and the
// synthetic-acceptance figure in the conclusions) against the current lib/ code.
// Audio inputs are synthetic strums built from each chord's frets, the same way
// lib/chordDetection.test.ts builds them.
//
//   node scripts/experimentos.mjs        (~1 min)
import { readFileSync } from "node:fs";
import Meyda from "meyda";
import { DETECTION, extractFrame, rankChords, matchesTarget } from "../lib/chordDetection.ts";
import { transitionScore } from "../lib/transitionDifficulty.ts";

const LIB = JSON.parse(readFileSync(new URL("../data/chords.json", import.meta.url), "utf8"));
const SR = 48000;
const OPEN = [40, 45, 50, 55, 59, 64];

// Deterministic noise/phases so every run gives the same numbers.
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
function strum(chord, size, seed = 5, amp = (h) => 0.1 / h) {
  const rand = rng(seed), out = new Float32Array(size);
  chord.frets.forEach((fret, s) => {
    if (fret < 0) return;
    const hz = 440 * 2 ** ((OPEN[s] + fret - 69) / 12);
    for (let h = 1; h <= 12; h++) {
      const phase = rand() * 2 * Math.PI, a = amp(h, s);
      for (let n = 0; n < size; n++) out[n] += a * Math.sin((2 * Math.PI * hz * h * n) / SR + phase);
    }
  });
  for (let n = 0; n < size; n++) out[n] += (rand() - 0.5) * 0.01;
  return out;
}
// Tone colors: mic-like bright, direct input (overtones barely fade), and uneven string volumes.
const FIVE = {
  bright: (h) => 0.1 * 0.8 ** (h - 1),
  directInput: (h) => 0.1 / Math.sqrt(h),
  directInputBright: (h) => 0.1 * 0.9 ** (h - 1),
  unevenA: (h, s) => (0.1 / h) * (s % 2 ? 1.4 : 0.6),
  unevenB: (h, s) => (0.1 / h) * (s % 2 ? 0.6 : 1.4),
};
const SIX = { plain: (h) => 0.1 / h, ...FIVE };
const ranked = (c, s, size, amp) => rankChords(extractFrame(Meyda, strum(c, size, 5, amp), SR, s).chroma, LIB, s);
const pct = (n, of) => `${Math.round((100 * n) / of)} %`;

// PE-01 — difficulty cutoffs over every pair of library chords.
const scores = [];
for (let i = 0; i < LIB.length; i++) for (let j = i + 1; j < LIB.length; j++) scores.push(transitionScore(LIB[i], LIB[j]));
const split = (lo, hi) => {
  const f = scores.filter((v) => v <= lo).length, m = scores.filter((v) => v > lo && v <= hi).length, d = scores.length - f - m;
  return `${pct(f, scores.length)} / ${pct(m, scores.length)} / ${pct(d, scores.length)}`;
};
const sorted = [...scores].sort((a, b) => a - b);
const symmetric = LIB.every((a) => LIB.every((b) => transitionScore(a, b) === transitionScore(b, a)));
console.log(`PE-01  ${scores.length} pares · terciles ${sorted[Math.floor((sorted.length - 1) / 3)]} y ${sorted[Math.floor((2 * (sorted.length - 1)) / 3)]} · simétricos: ${symmetric}`);
console.log(`       cortes 6/10: ${split(6, 10)} · cortes 5/9: ${split(5, 9)}`);

// PE-02 / PE-03 — how many of 168 strums (28 × 6 tones) rank the played chord first.
const firstOf = (s, size) => Object.values(SIX).reduce((n, amp) => n + LIB.filter((c) => ranked(c, s, size, amp)[0].chord.name === c.name).length, 0);
const old = { ...DETECTION, chromaCenterOctave: 5 };
console.log(`PE-02  sin armónicos ${firstOf({ ...DETECTION, harmonicDecay: 0 }, 16384)}/168 · con armónicos ${firstOf(DETECTION, 16384)}/168` +
  ` (banda original: ${firstOf({ ...old, harmonicDecay: 0 }, 16384)} → ${firstOf(old, 16384)})`);
console.log(`PE-03  ventana 8192: ${firstOf(DETECTION, 8192)}/168 · ventana 16384: ${firstOf(DETECTION, 16384)}/168`);

// PE-04 — chroma band: wrong rejections / wrong acceptances over 140 strums (28 × 5 tones), D vs D7 gap.
for (const [label, s] of [["≈ 880 Hz (octava 5)", old], ["≈ 260 Hz (octava 3,25)", DETECTION]]) {
  let rejected = 0, wrongAccepted = 0;
  for (const amp of Object.values(FIVE)) for (const c of LIB) {
    const r = ranked(c, s, s.fftSize, amp);
    if (!matchesTarget(r, c, s)) rejected++;
    wrongAccepted += LIB.filter((o) => o.name !== c.name && matchesTarget(r, o, s)).length;
  }
  const d = rankChords(extractFrame(Meyda, strum(LIB.find((c) => c.name === "D"), s.fftSize, 3, FIVE.directInputBright), SR, s).chroma, LIB, s);
  const sc = (n) => d.find((x) => x.chord.name === n).score;
  console.log(`PE-04  ${label}: ${rejected}/140 rechazos · ${wrongAccepted} aceptaciones equivocadas · D − D7 = ${(sc("D") - sc("D7")).toFixed(3)}`);
}

// PE-05 — each chord's score against its own template (current settings).
const self = [];
for (const amp of Object.values(FIVE)) for (const c of LIB) self.push(ranked(c, DETECTION, DETECTION.fftSize, amp).find((r) => r.chord.name === c.name).score);
console.log(`PE-05  mínimo ${Math.min(...self).toFixed(3)} · bajo 0,90: ${self.filter((v) => v < 0.9).length}/140 · bajo 0,87: ${self.filter((v) => v < 0.87).length}/140`);

// Conclusions — correct acceptances over 140 strums: plain templates + original band vs. today.
const accepted = (s) => Object.values(FIVE).reduce((n, amp) => n + LIB.filter((c) => matchesTarget(ranked(c, s, s.fftSize, amp), c, s)).length, 0);
console.log(`Concl. aceptación correcta: ${accepted({ ...old, harmonicDecay: 0 })}/140 → ${accepted(DETECTION)}/140`);
