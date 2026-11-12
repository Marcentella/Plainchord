// Camera fingering check measured on GuiFiR (IEEE Access 2026,
// doi:10.1109/ACCESS.2026.3713562): the app's fingertip reading, and two corrections
// tried on it that did NOT help (2026-11-11), kept so the result can be reproduced:
// - a per-finger linear correction learned from the finger's shape (40.5 % vs 41.0 %);
// - a per-clip offset per finger, measured on the clip's first frames (worse).
// MediaPipe's tip error changes frame to frame with the hand's pose; it isn't a steady
// bias, per finger or per setup, that a fixed correction could subtract.
// See docs/camara-limitaciones.md.
// Uses the app's own fret mapping and the landmarks scripts/guifir/landmarks.py saved
// with the app's own hand model.
//
//   node scripts/guifir/evaluate.mjs <dir containing GuiFiR/ and landmarks.json>
//
// Env: LANDMARKS=<file> scores another hand model's landmarks; DUMP=<file> writes every
// labelled frame (corners, hand, labelled tips, notes, fold) for scripts/refiner.
//
// The learned correction is scored by 5-fold cross-validation grouped by song: fitted on four
// groups of songs and scored on the fifth, so every reported reading comes from a song
// (player, guitar, camera) it never trained on. GuiFiR's own val/test split shares songs,
// and 30 val clips proved too few setups to generalize from.
//
// The dataset's hand-labelled fretboard corners stand in for the user's calibration
// clicks, so what's left is the hand model's error (plus the mapping's own, which
// the "labelled fingertips" row isolates).
//
// Dataset facts found by inspection, not documented upstream (2026-11-11):
// - Frame numbers are on a 30 fps time base whatever the clip's own rate
//   (`_299` appears in 250-frame, 25 fps clips): label n is at n/30 s.
// - Corners: rt/rb on the nut, lt/lb where the fretboard ends; t = low E edge.
// - frame_tab[0] is the HIGH e (1st string), the reverse of data/chords.json; 20 = not
//   played. Flipped, the labelled fingertips land on the labelled string ~95 % of the time.
// - Frets count from the capo in most clips, from the nut in some (10 of 87 capo clips):
//   decided per clip by which reading the labelled fingertips agree with.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fretAt,
  fretPositionIn,
  neckUV,
  onNeck,
  pressPoint,
  PRESS_PULLBACK as DEFAULT_PULLBACK,
  applyHomography,
  solveHomography,
  stringAt,
  stringSpread,
  wireU,
} from "../../lib/fretMapping.ts";

const ROOT = process.argv[2];
if (!ROOT) throw new Error("usage: node scripts/guifir/evaluate.mjs <dataset dir>");
const landmarks = JSON.parse(readFileSync(process.env.LANDMARKS ?? join(ROOT, "landmarks.json"), "utf8"));
const rows = ["val", "test"].flatMap((split) =>
  readFileSync(join(ROOT, `GuiFiR/annotations/guifir_${split}_coco_anno_box.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((line) => ({ split, ...JSON.parse(line) })),
);
const songOf = (row) => row.filename.split("/")[0].replace(/_\d+$/, "");
const FOLDS = 5;
// Songs dealt round-robin, largest first, so the folds come out about the same size.
const songSizes = Object.entries(Object.groupBy(rows, songOf)).sort((a, b) => b[1].length - a[1].length);
const foldOfSong = Object.fromEntries(songSizes.map(([song], i) => [song, i % FOLDS]));
const foldOf = (row) => foldOfSong[songOf(row)];

const TIPS = [8, 12, 16, 20]; // index..pinky, as the app reads them (the thumb never frets a chord)
const DIPS = [7, 11, 15, 19];
const NAMES = ["índice", "medio", "anular", "meñique"];
const NOT_PLAYED = 20;
const gtPoint = ([x, y]) => ({ x: x / 640, y: y / 360 });
const gtTip = (row, i) => (row.frame_gt_pose[TIPS[i]]?.[2] === 2 ? gtPoint(row.frame_gt_pose[TIPS[i]]) : null);
const clipOf = (row) => row.filename.split("/")[0];

function calibrationFor(row, endFret) {
  const g = row.frame_gt_pose;
  const corners = [g.rt, g.rb, g.lt, g.lb].map(gtPoint);
  const end = wireU(endFret);
  const plane = [
    { x: 0, y: -stringSpread(0) / 2 },
    { x: 0, y: stringSpread(0) / 2 },
    { x: end, y: -stringSpread(end) / 2 },
    { x: end, y: stringSpread(end) / 2 },
  ];
  return { toNeck: solveHomography(corners, plane) };
}

/** Landmarks of label n under a timing offset (0 or 1: is label n frame n or n−1?). */
function handsAt(row, offset) {
  const [clip, file] = row.filename.split("/");
  const n = Number(file.match(/_(\d+)\.png$/)[1]);
  const { fps, frames } = landmarks[clip];
  return frames[Math.min(frames.length - 1, Math.round(((n - offset) / 30) * fps))] ?? [];
}

/** The app's choice: the hand with the most fingertips over the calibrated neck. */
function frettingHand(hands, cal) {
  let best = null;
  let bestCount = 0;
  for (const hand of hands) {
    const pts = hand.points.map(([x, y]) => ({ x, y }));
    const count = TIPS.filter((t, i) => onNeck(neckUV(cal, pressPoint(pts[t], pts[DIPS[i]])))).length;
    if (count > bestCount) [best, bestCount] = [pts, count];
  }
  return best;
}

/** (string, fret) a reading-coordinates point lands on, or null off the neck. */
function read(uv) {
  if (!onNeck(uv)) return null;
  const string = stringAt(uv.y);
  const fret = fretAt(uv.x);
  return string === null || fret === null ? null : { string, fret };
}

/** Fretted notes of a label, strings in the app's order (0 = low E), frets counted from the nut. */
function notes(row, withCapo) {
  return row.frame_tab.flatMap((fret, i) =>
    fret === NOT_PLAYED || fret === 0 ? [] : [{ string: 5 - i, fret: fret + (withCapo ? row.frame_capo : 0) }],
  );
}

/**
 * Labelled fretted notes that some finger reads exactly, per clip.
 * `pointsOf(row, cal)`: the four fingers in reading coordinates (null = no hand).
 * `capo(clip)`: does that clip's tab count from the capo?
 */
function noteHits(subset, endFret, capo, pointsOf) {
  const perClip = {};
  for (const row of subset) {
    const cal = calibrationFor(row, endFret);
    const points = pointsOf(row, cal);
    const reads = points ? points.map((p) => p && read(p)) : [];
    const c = (perClip[clipOf(row)] ??= { hit: 0, total: 0, seen: 0, seenHit: 0 });
    for (const note of notes(row, capo(clipOf(row)))) {
      const hit = reads.some((r) => r && r.string === note.string && r.fret === note.fret);
      c.total++;
      if (hit) c.hit++;
      if (points) {
        c.seen++;
        if (hit) c.seenHit++;
      }
    }
  }
  return perClip;
}
function sum(perClip) {
  const total = (k) => Object.values(perClip).reduce((a, c) => a + c[k], 0);
  const [hit, all, seen, seenHit] = ["hit", "total", "seen", "seenHit"].map(total);
  return { hit, total: all, pct: all ? (100 * hit) / all : 0, seenPct: seen ? (100 * seenHit) / seen : 0, seen };
}

const gtTips = (row, cal) => TIPS.map((_, i) => gtTip(row, i) && neckUV(cal, gtTip(row, i)));

// 1. Unknowns settled with the labelled fingertips, which carry no hand-model error:
//    the fret the far corners sit on, and whether each clip's tab counts from the capo.
let best = null;
for (const endFret of [15, 16, 17, 18, 19, 20, 21, 22]) {
  const withCapo = noteHits(rows, endFret, () => true, gtTips);
  const without = noteHits(rows, endFret, () => false, gtTips);
  const capoClips = new Set(Object.keys(withCapo).filter((c) => withCapo[c].hit >= without[c].hit));
  const r = sum(noteHits(rows, endFret, (c) => capoClips.has(c), gtTips));
  if (!best || r.pct > best.pct) best = { endFret, capoClips, ...r };
}
const { endFret, capoClips } = best;
const capo = (clip) => capoClips.has(clip);

// 2. Fingertip pairs: the model's hand and the labelled tip of the same finger.
function pairs(subset, offset) {
  const out = [];
  let found = 0;
  for (const row of subset) {
    const cal = calibrationFor(row, endFret);
    const hand = frettingHand(handsAt(row, offset), cal);
    if (!hand) continue;
    found++;
    for (let i = 0; i < 4; i++) {
      const gt = gtTip(row, i);
      if (gt && onNeck(neckUV(cal, gt))) out.push({ row, cal, hand, finger: i, gt });
    }
  }
  return { pairs: out, found, frames: subset.length };
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
/** Model point vs labelled tip, in string spacings across (+ = toward the high e) and frets along (+ = toward the bridge). */
function error(p, uvOf) {
  const a = neckUV(p.cal, p.gt);
  const b = uvOf(p);
  return { finger: p.finger, strings: (b.y - a.y) * 5, frets: fretPositionIn(b.x) - fretPositionIn(a.x) };
}
// PULLBACK=<n>: press point override, for landmarks whose tips are already press points (scripts/refiner).
const PRESS_PULLBACK = process.env.PULLBACK === undefined ? DEFAULT_PULLBACK : Number(process.env.PULLBACK);
const rawUV = (pull) => (p) => neckUV(p.cal, pressPoint(p.hand[TIPS[p.finger]], p.hand[DIPS[p.finger]], pull));
const absMedian = (ps) => median(ps.map((p) => error(p, rawUV(0))).map((e) => Math.hypot(e.strings, e.frets)));
// Timing offset: whichever puts the model's fingertips closer to the labelled ones.
const offset = absMedian(pairs(rows, 0).pairs) <= absMedian(pairs(rows, 1).pairs) ? 0 : 1;

// 3a. Learned correction: per finger, ridge regression from the finger's shape to the
//     labelled tip's offset. Features, in the neck plane and in string spacings (so one
//     set of weights fits any camera distance): where the finger's DIP, PIP, knuckle and
//     the wrist sit relative to its tip, how far across the neck the tip is, and a bias.
//     Pairs more than OUTLIER string spacings off are a wrong hand or a lost finger,
//     not a tip to learn from.
const OUTLIER = 3;
const MAX_SHIFT = 1.5;
function correctionFeatures(cal, hand, finger) {
  const knuckle = 5 + 4 * finger;
  const plane = (i) => applyHomography(cal.toNeck, hand[i]);
  const tip = plane(knuckle + 3);
  const spacing = stringSpread(tip.x) / 5;
  const features = [knuckle + 2, knuckle + 1, knuckle, 0].flatMap((i) => {
    const p = plane(i);
    return [(p.x - tip.x) / spacing, (p.y - tip.y) / spacing];
  });
  features.push(tip.y / stringSpread(tip.x) + 0.5, 1);
  return { tip, spacing, features };
}
function correctedUV(cal, hand, finger, weights) {
  const { tip, spacing, features } = correctionFeatures(cal, hand, finger);
  const [dx, dy] = weights[finger].map((w) =>
    Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, w.reduce((s, wi, i) => s + wi * features[i], 0) || 0)),
  );
  const x = tip.x + dx * spacing;
  return { x, y: (tip.y + dy * spacing) / stringSpread(x) + 0.5 };
}
const RIDGE = 1;
function solve(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
function fit(trainPairs) {
  return [0, 1, 2, 3].map((finger) => {
    const xs = [];
    const ys = [];
    for (const p of trainPairs.filter((q) => q.finger === finger)) {
      const { tip, spacing, features } = correctionFeatures(p.cal, p.hand, finger);
      const gtPlane = applyHomography(p.cal.toNeck, p.gt);
      const target = [(gtPlane.x - tip.x) / spacing, (gtPlane.y - tip.y) / spacing];
      if (Math.hypot(...target) > OUTLIER || features.some((f) => !Number.isFinite(f))) continue;
      xs.push(features);
      ys.push(target);
    }
    const n = xs[0].length;
    const xtx = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => xs.reduce((s, x) => s + x[i] * x[j], 0) + (i === j && i < n - 1 ? RIDGE : 0)),
    );
    return [0, 1].map((k) => solve(xtx, Array.from({ length: n }, (_, i) => xs.reduce((s, x, r) => s + x[i] * ys[r][k], 0))));
  });
}
const allPairs = pairs(rows, offset);
// DUMP=<file>: every labelled frame with a hand, for training and drawing (scripts/refiner).
if (process.env.DUMP) {
  const frameIndex = (row) => {
    const [clip, file] = row.filename.split("/");
    const { fps, frames } = landmarks[clip];
    return Math.min(frames.length - 1, Math.round((Number(file.match(/_(\d+)\.png$/)[1]) / 30) * fps));
  };
  const seen = new Map();
  for (const p of allPairs.pairs) {
    if (seen.has(p.row)) continue;
    const g = p.row.frame_gt_pose;
    seen.set(p.row, {
      clip: clipOf(p.row),
      frame: frameIndex(p.row),
      fold: foldOf(p.row),
      corners: [g.rt, g.rb, g.lt, g.lb].map(gtPoint),
      endFret,
      hand: p.hand,
      gt: [0, 1, 2, 3].map((i) => gtTip(p.row, i)),
      notes: notes(p.row, capo(clipOf(p.row))),
    });
  }
  writeFileSync(process.env.DUMP, JSON.stringify([...seen.values()]));
}
const foldWeights = [...Array(FOLDS).keys()].map((k) => fit(allPairs.pairs.filter((p) => foldOf(p.row) !== k)));
/** Corrected with the weights of the fold that never saw this frame's song. */
const fixedUV = (p) => correctedUV(p.cal, p.hand, p.finger, foldWeights[foldOf(p.row)]);

// 3b. Per-setup offset: each finger's mean miss over a clip's first CAL_FRAMES labelled
//     frames (as if the user first held a known chord), added to the rest of that clip.
//     Scored on the frames after those. Optimistic: it uses the labelled tips, which the
//     app wouldn't have.
const CAL_FRAMES = 5;
const frameNo = (row) => Number(row.filename.match(/_(\d+)\.png$/)[1]);
const calFrames = new Set();
const clipShift = {};
for (const [clip, ps] of Object.entries(Object.groupBy(allPairs.pairs, (p) => clipOf(p.row)))) {
  const first = [...new Set(ps.map((p) => p.row))].sort((a, b) => frameNo(a) - frameNo(b)).slice(0, CAL_FRAMES);
  first.forEach((r) => calFrames.add(r));
  clipShift[clip] = [0, 1, 2, 3].map((finger) => {
    const misses = ps
      .filter((p) => p.finger === finger && first.includes(p.row))
      .map((p) => {
        const a = neckUV(p.cal, p.gt);
        const b = rawUV(PRESS_PULLBACK)(p);
        return { x: a.x - b.x, y: a.y - b.y };
      });
    const avg = (k) => (misses.length ? misses.reduce((s, m) => s + m[k], 0) / misses.length : 0);
    return { x: avg("x"), y: avg("y") };
  });
}
const afterCal = rows.filter((r) => !calFrames.has(r));
const shiftedUV = (p) => {
  const uv = rawUV(PRESS_PULLBACK)(p);
  const s = clipShift[clipOf(p.row)]?.[p.finger] ?? { x: 0, y: 0 };
  return { x: uv.x + s.x, y: uv.y + s.y };
};

// 4. Report.
const f1 = (x) => x.toFixed(1);
const f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const handPoints = (uvOf) => (row, cal) => {
  const hand = frettingHand(handsAt(row, offset), cal);
  return hand && [0, 1, 2, 3].map((finger) => uvOf({ row, cal, hand, finger }));
};

const capoUsed = new Set(rows.filter((r) => r.frame_capo > 0).map(clipOf));
console.log(`GuiFiR val+prueba: ${rows.length} fotogramas, ${new Set(rows.map(clipOf)).size} clips, ${songSizes.length} canciones, ${allPairs.pairs.length} puntas; validación cruzada en ${FOLDS} grupos por canción`);
console.log(`Ajustes deducidos: esquinas lejanas en el traste ${endFret}; clips con cejilla cuyo tab cuenta desde ella: ${[...capoUsed].filter(capo).length}/${capoUsed.size}; desfase de fotograma ${offset}\n`);

console.log("Notas pisadas leídas exactamente (cuerda y traste) por algún dedo:");
for (const [label, pointsOf] of [
  ["Puntas etiquetadas (techo del mapeo)", gtTips],
  [`Modelo de mano, punto de presión ${PRESS_PULLBACK} (la app hoy)`, handPoints(rawUV(PRESS_PULLBACK))],
  ["Modelo de mano + corrección aprendida", handPoints(fixedUV)],
]) {
  const r = sum(noteHits(rows, endFret, capo, pointsOf));
  console.log(`  ${label.padEnd(48)} ${f1(r.pct).padStart(5)} %  (${r.hit}/${r.total}); con la mano hallada: ${f1(r.seenPct)} % de ${r.seen}`);
}
console.log(`\nIgual, sin los primeros ${CAL_FRAMES} fotogramas de cada clip (usados para medir el desvío de cada dedo):`);
for (const [label, pointsOf] of [
  [`Modelo de mano, punto de presión ${PRESS_PULLBACK} (la app hoy)`, handPoints(rawUV(PRESS_PULLBACK))],
  ["Modelo de mano + desvío medido por clip", handPoints(shiftedUV)],
]) {
  const r = sum(noteHits(afterCal, endFret, capo, pointsOf));
  console.log(`  ${label.padEnd(48)} ${f1(r.pct).padStart(5)} %  (${r.hit}/${r.total}); con la mano hallada: ${f1(r.seenPct)} % de ${r.seen}`);
}

const test = allPairs;
for (const [label, uvOf] of [[`punto de presión ${PRESS_PULLBACK}`, rawUV(PRESS_PULLBACK)], ["con corrección", fixedUV]]) {
  const errs = test.pairs.map((p) => error(p, uvOf));
  console.log(`\nError vs punta etiquetada (${label}; mano hallada en ${test.found}/${test.frames} fotogramas):`);
  console.log("  dedo       n      sesgo cuerdas  sesgo trastes  |error| mediano (cuerdas, trastes)  >0,5 cuerda");
  for (let i = 0; i < 4; i++) {
    const e = errs.filter((x) => x.finger === i);
    const off = e.filter((x) => Math.abs(x.strings) > 0.5).length;
    console.log(
      `  ${NAMES[i].padEnd(9)} ${String(e.length).padStart(5)}   ${f2(mean(e.map((x) => x.strings))).padStart(8)}       ${f2(mean(e.map((x) => x.frets))).padStart(8)}       ${f2(median(e.map((x) => Math.abs(x.strings))))}, ${f2(median(e.map((x) => Math.abs(x.frets))))}                ${f1((100 * off) / e.length)} %`,
    );
  }
}
console.log("\nSesgo de cuerdas: + = hacia la 1ª (mi agudo). Sesgo de trastes: + = hacia el puente.");

