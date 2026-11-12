// The camera fingering check on our own recordings: chords held still in front of a
// webcam, the way the app is used. Same pipeline as lib/useFingerCamera.ts, frame by
// frame: calibration from four clicks on the nut and 12th fret, measured fret wires,
// neck following (the guitar moves while strumming: without it the grid drifts off the
// neck), fretting-hand choice, One Euro smoothing, press point, hysteresis, the 150 ms
// stabilizer and the finger lock. Everything starts at the frame the clicks were made on.
//
//   ffmpeg on PATH
//   mpenv/Scripts/python scripts/guifir/landmarks.py <videos dir> <dir>/landmarks.json
//   mpenv/Scripts/python scripts/own-videos/corners.py <videos dir> <dir>/corners.json
//   node scripts/own-videos/evaluate.mjs <videos dir> <dir>
//
// Env: LANDMARKS=<file> scores another hand model's landmarks (same format);
// REFINER=<file.onnx> runs the fingertip refiner the way the app does (lib/fingerRefiner*.ts);
// RTMPOSE=<file.onnx> re-reads the hand with RTMPose first (high-precision mode, lib/rtmPose.ts;
// pair it with the refiner trained on RTMPose's points); REFINE_EVERY=<frames> makes each
// answer arrive that many frames after it was asked, as in the browser (default 1);
// PULLBACK=<n> overrides the press point; DUMP=<file> writes each frame's tracked neck corners and hand, for drawing.
//
// Video names: <chord>-<variant>.mp4, e.g. C-normal.mp4, G-threefourths.mp4. A variant
// starting with "wrong" is a chord held wrong on purpose: there the check should NOT
// read it as in place.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calibrate, fretAt, fretPositionIn, isCalibration, neckUV, onNeck, pressPoint, PRESS_PULLBACK, stringAt } from "../../lib/fretMapping.ts";
import { detectFretWires } from "../../lib/fretDetection.ts";
import { NeckTracker, seededRandom } from "../../lib/neckTracking.ts";
import { OneEuroFilter } from "../../lib/oneEuroFilter.ts";
import { TipOffsets } from "../../lib/fingerRefiner.ts";
import { createFingerRefiner } from "../../lib/fingerRefinerModel.ts";
import { createRtmPose } from "../../lib/rtmPose.ts";
import { allInPlace, checkChord, expectedFingers, FingerLock, ReadingStabilizer } from "../../lib/chordFingerCheck.ts";

const [VIDEOS, DIR] = process.argv.slice(2);
if (!VIDEOS || !DIR) throw new Error("usage: node scripts/own-videos/evaluate.mjs <videos dir> <dir with landmarks.json and corners.json>");
const landmarks = JSON.parse(readFileSync(process.env.LANDMARKS ?? join(DIR, "landmarks.json"), "utf8"));
const dump = {};
const refiner = process.env.REFINER ? await createFingerRefiner(new Uint8Array(readFileSync(process.env.REFINER))) : null;
const rtm = process.env.RTMPOSE ? await createRtmPose(new Uint8Array(readFileSync(process.env.RTMPOSE))) : null;
const REFINE_EVERY = Number(process.env.REFINE_EVERY ?? 1);
const corners = JSON.parse(readFileSync(join(DIR, "corners.json"), "utf8"));
const library = JSON.parse(readFileSync(new URL("../../data/chords.json", import.meta.url), "utf8"));
const chords = Object.fromEntries((Array.isArray(library) ? library : library.chords).map((c) => [c.name, c]));
// The player's own G: middle on the 6th string, index on the 5th, pinky on the 1st
// (the diagram uses ring/middle/pinky). Scored against what was actually played.
chords.G = { ...chords.G, fingers: [2, 1, 0, 0, 0, 4] };

// What useFingerCamera.ts sees: a 1280×720 camera (the resolution it asks for).
const W = 1280;
const H = 720;
const TIPS = [8, 12, 16, 20];
const DIPS = [7, 11, 15, 19];
const LOST_HAND_MS = 300;
const PULLBACK = process.env.PULLBACK === undefined ? PRESS_PULLBACK : Number(process.env.PULLBACK);
/** Neck following works on a 480 px wide copy (useFingerCamera.ts TRACK_WIDTH). */
const TW = 480;
const TH = Math.round((TW * H) / W);
/** The first part of each video is the player showing the hand and forming the chord. */
const SETTLED_FROM = 0.5;

function grayFrame(video, seconds) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], {
    maxBuffer: W * H * 2,
  });
  return { data: Float32Array.from(raw), width: W, height: H };
}

/** Every frame of a video, grayscale at the neck tracker's size. */
function grayFrames(video) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `scale=${TW}:${TH}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], {
    maxBuffer: 1 << 30,
  });
  const size = TW * TH;
  return Array.from({ length: Math.floor(raw.length / size) }, (_, k) => ({
    data: Float32Array.from(raw.subarray(k * size, (k + 1) * size)),
    width: TW,
    height: TH,
  }));
}

/** Every frame of a video as the app's camera would give it: W×H RGBA. */
function colourFrames(video) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 - 1 });
  const size = W * H * 4;
  return (n) => (n * size + size <= raw.length ? { data: raw.subarray(n * size, (n + 1) * size), width: W, height: H } : null);
}

async function run(name) {
  const [chordName, ...rest] = name.split("-");
  const variant = rest.join("-");
  const chord = chords[chordName];
  const marked = corners[name];
  let cal = calibrate(marked.clicks.map(([x, y]) => ({ x, y })), 12);
  if (!isCalibration(cal)) return { name, error: `calibración rechazada (${cal})` };
  const measured = detectFretWires(grayFrame(join(VIDEOS, `${name}.mp4`), marked.seconds), cal);
  if (measured) cal = { ...cal, wires: measured.wires, found: measured.found };

  const { fps, frames } = landmarks[name];
  const gray = grayFrames(join(VIDEOS, `${name}.mp4`));
  const start = Math.round(marked.seconds * fps);
  let tracker = null;
  let neckLost = 0;
  const colour = refiner ? colourFrames(join(VIDEOS, `${name}.mp4`)) : null;
  const offsets = new TipOffsets();
  let pending = null;
  const filters = Array.from({ length: 21 }, () => ({ x: new OneEuroFilter(), y: new OneEuroFilter() }));
  const stabilizer = new ReadingStabilizer();
  const lock = new FingerLock();
  const previous = [null, null, null, null];
  let lastSeen = -Infinity;
  const settled = { frames: 0, allOk: 0, handFound: 0, fingerOk: [0, 0, 0, 0], rawOk: [0, 0, 0, 0], statuses: [{}, {}, {}, {}], miss: [[], [], [], []] };
  const expected = expectedFingers(chord);
  let firstAllOk = null;

  for (let n = 0; n < frames.length; n++) {
    const hands = frames[n];
    if (n < start || !gray[n]) continue;
    const now = (n * 1000) / fps;
    // Neck following, as useFingerCamera.ts does it before reading anything off the neck.
    const handPx = hands.flatMap((h) => h.points.map(([x, y]) => ({ x: x * TW, y: y * TH })));
    if (!tracker) {
      tracker = new NeckTracker(gray[n], cal.corners.map((p) => ({ x: p.x * TW, y: p.y * TH })), handPx, seededRandom(1));
    } else {
      const result = tracker.update(gray[n], handPx);
      if (result.corners) {
        const moved = calibrate(result.corners.map((p) => ({ x: p.x / TW, y: p.y / TH })), cal.fret, true, { wires: cal.wires, found: cal.found });
        if (isCalibration(moved)) cal = moved;
      } else neckLost++;
    }
    let fretting = null;
    let best = 0;
    for (const hand of hands) {
      const pts = hand.points.map(([x, y]) => ({ x, y }));
      const count = TIPS.filter((t, i) => onNeck(neckUV(cal, pressPoint(pts[t], pts[DIPS[i]])), cal.wires)).length;
      if (count > best) [best, fretting] = [count, pts];
    }
    const positions = [null, null, null, null];
    let raw = [null, null, null, null];
    if (fretting) {
      lastSeen = now;
      const smooth = fretting.map((p, i) => ({ x: filters[i].x.filter(p.x * W, now / 1000) / W, y: filters[i].y.filter(p.y * H, now / 1000) / H }));
      // The app asks without waiting and uses the answer when it arrives: here it lands REFINE_EVERY frames later.
      if (pending && n >= pending.at) {
        const { answer, asked } = pending;
        if (answer) asked.forEach((p, i) => offsets.update(i, p, answer[i]));
        pending = null;
      }
      if (refiner && !pending && colour(n)) {
        const frame = colour(n);
        const hand = rtm ? await rtm.detect(frame, fretting) : fretting;
        pending = { answer: await refiner.refine(frame, cal, hand), asked: TIPS.map((tip) => neckUV(cal, fretting[tip])), at: n + REFINE_EVERY };
      }
      TIPS.forEach((tip, i) => {
        const neck = offsets.apply(i, neckUV(cal, smooth[tip])) ?? neckUV(cal, pressPoint(smooth[tip], smooth[DIPS[i]], PULLBACK));
        let reading = null;
        if (onNeck(neck, cal.wires)) {
          positions[i] = { string: neck.y * 5, fret: fretPositionIn(neck.x, cal.wires) };
          const s = stringAt(neck.y, previous[i]?.string ?? null);
          const f = fretAt(neck.x, previous[i]?.fret ?? null, cal.wires);
          if (s !== null && f !== null) reading = { string: s, fret: f };
        }
        previous[i] = reading;
      });
      raw = [...previous];
    } else if (now - lastSeen > LOST_HAND_MS) {
      filters.forEach((f) => (f.x.reset(), f.y.reset()));
      offsets.reset();
      pending = null;
      previous.fill(null);
      stabilizer.reset();
    }
    const stable = fretting ? stabilizer.update(previous, now) : stabilizer.update([null, null, null, null], now);
    const { readings } = lock.update(chord, stable, positions, now);
    if (process.env.DUMP) (dump[name] ??= {})[n] = { corners: cal.corners, wires: cal.wires, hand: fretting, positions, readings };
    const checks = checkChord(chord, readings);
    const ok = allInPlace(checks);
    if (ok && firstAllOk === null) firstAllOk = now / 1000;
    if (n < Math.max(start, frames.length * SETTLED_FROM)) continue;
    settled.frames++;
    if (fretting) settled.handFound++;
    if (ok) settled.allOk++;
    const rawChecks = checkChord(chord, raw);
    checks.forEach((c, i) => {
      if (c.status === "unused") return;
      // How far the press point lands from where the chord puts the finger: strings across
      // (+ = toward the 1st), frets along (0 = on the fret's own wire, −1 = on the wire behind).
      if (positions[i]) settled.miss[i].push({ s: positions[i].string - expected[i].strings[0], f: positions[i].fret - expected[i].fret });
      if (c.status === "ok") settled.fingerOk[i]++;
      if (rawChecks[i].status === "ok") settled.rawOk[i]++;
      settled.statuses[i][c.status] = (settled.statuses[i][c.status] ?? 0) + 1;
    });
  }
  return { name, chord, variant, wires: measured ? measured.found.filter(Boolean).length - 1 : 0, firstAllOk, neckLost, ...settled };
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "—");
const FINGER = ["índ", "med", "anu", "meñ"];
const STATUS = { ok: "ok", wrongString: "cuerda", wrongFret: "traste", elsewhere: "otro", notSeen: "no visto" };
console.log(`Segunda mitad de cada video (la primera es mostrar la mano y armar el acorde). Pipeline completo de la app.\n`);
const results = [];
for (const name of Object.keys(corners).filter((name) => landmarks[name]).sort()) results.push(await run(name));
for (const r of results) {
  if (r.error) {
    console.log(`${r.name.padEnd(42)} ${r.error}`);
    continue;
  }
  const wrong = r.variant.startsWith("wrong");
  const used = [0, 1, 2, 3].filter((i) => r.chord.fingers.includes(i + 1));
  const fingers = used
    .map((i) => {
      const worst = Object.entries(r.statuses[i]).filter(([s]) => s !== "ok").sort((a, b) => b[1] - a[1])[0];
      const med = (k) => {
        const v = r.miss[i].map((m) => m[k]).sort((a, b) => a - b);
        return v.length ? (v[v.length >> 1] >= 0 ? "+" : "") + v[v.length >> 1].toFixed(2) : "—";
      };
      return `${FINGER[i]} ${pct(r.fingerOk[i], r.frames)} (crudo ${pct(r.rawOk[i], r.frames)}${worst ? `, si no: ${STATUS[worst[0]]}` : ""}; desvío ${med("s")} cuerdas, ${med("f")} trastes)`;
    })
    .join(" | ");
  console.log(
    `${r.name.padEnd(42)} ${wrong ? "acorde MAL, leído como bien" : "acorde completo bien"}: ${pct(r.allOk, r.frames).padStart(5)}` +
      `  primer "bien" a los ${r.firstAllOk === null ? "—" : r.firstAllOk.toFixed(1) + " s"}  mano ${pct(r.handFound, r.frames)}  trastes medidos ${r.wires}/20  mástil perdido ${r.neckLost} fotogramas\n    ${fingers}`,
  );
}
// One line to compare hand models and settings by. "Dedos en su casilla": raw press points
// (before the stabilizer and the lock) inside the right string and fret, over every finger
// the chords use in the correctly held videos.
const right = results.filter((r) => !r.error && !r.variant.startsWith("wrong"));
const cells = right.flatMap((r) => [0, 1, 2, 3].filter((i) => r.chord.fingers.includes(i + 1)).map((i) => r.rawOk[i] / r.frames));
const avg = (xs) => (100 * xs.reduce((a, b) => a + b, 0)) / xs.length;
console.log(`
RESUMEN  acordes bien armados leídos bien: ${avg(right.map((r) => r.allOk / r.frames)).toFixed(1)} %   dedos en su casilla (crudo): ${avg(cells).toFixed(1)} %   videos: ${right.length}`);
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(dump));
