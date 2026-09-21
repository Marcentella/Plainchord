import { test } from "node:test";
import assert from "node:assert/strict";
import {
  midiToFrequency,
  noteName,
  centsBetween,
  nearestMidi,
  accuracyFor,
  readingFor,
  medianFrequency,
  isPlausiblePitch,
  TUNING_PRESETS,
} from "./tuning.ts";

test("midiToFrequency: A4 (MIDI 69) is exactly 440 Hz", () => {
  assert.equal(midiToFrequency(69), 440);
});

test("noteName at octave boundaries", () => {
  assert.equal(noteName(40), "E2");
  assert.equal(noteName(60), "C4");
  assert.equal(noteName(69), "A4");
});

test("centsBetween is 0 exactly at the target frequency", () => {
  assert.equal(centsBetween(440, 440), 0);
});

test("centsBetween is +-100 a semitone away", () => {
  const semitoneUp = midiToFrequency(70);
  assert.ok(Math.abs(centsBetween(semitoneUp, 440) - 100) < 0.01);
  const semitoneDown = midiToFrequency(68);
  assert.ok(Math.abs(centsBetween(semitoneDown, 440) - -100) < 0.01);
});

test("nearestMidi picks the closer string, not just the lowest", () => {
  // Standard tuning low E (40) vs A (45) — a frequency flat of E but much
  // closer to E than to A should resolve to E, not A.
  const standard = TUNING_PRESETS.find((p) => p.id === "standard")!.strings!;
  const nearE = midiToFrequency(40) * 2 ** (-10 / 1200); // 10 cents flat of E2
  assert.equal(nearestMidi(nearE, standard), 40);
});

test("nearestMidi in chromatic mode resolves a note absent from every preset", () => {
  // F3 (MIDI 53) isn't in the standard-tuning string set.
  assert.equal(nearestMidi(midiToFrequency(53), null), 53);
});

test("accuracyFor boundaries", () => {
  assert.equal(accuracyFor(5), "inTune");
  assert.equal(accuracyFor(5.1), "close");
  assert.equal(accuracyFor(15), "close");
  assert.equal(accuracyFor(15.1), "off");
  assert.equal(accuracyFor(-15), "close");
});

test("readingFor composes note name, cents, and accuracy for a slightly flat string", () => {
  const standard = TUNING_PRESETS.find((p) => p.id === "standard")!.strings!;
  const flatE = midiToFrequency(40) * 2 ** (-20 / 1200); // 20 cents flat
  const reading = readingFor(flatE, standard);
  assert.equal(reading.targetMidi, 40);
  assert.equal(reading.noteName, "E2");
  assert.ok(reading.cents < 0);
  assert.equal(reading.accuracy, "off");
});

test("medianFrequency rejects a single wild outlier", () => {
  assert.equal(medianFrequency([440, 441, 439, 440, 900]), 440);
});

test("isPlausiblePitch rejects low clarity", () => {
  assert.equal(isPlausiblePitch(440, 0.5), false);
  assert.equal(isPlausiblePitch(440, 0.9), true);
});

test("isPlausiblePitch rejects out-of-guitar-range frequencies", () => {
  assert.equal(isPlausiblePitch(30, 0.95), false);
  assert.equal(isPlausiblePitch(2000, 0.95), false);
});

test("every tuning preset's string count is 6, except chromatic", () => {
  for (const preset of TUNING_PRESETS) {
    if (preset.id === "chromatic") {
      assert.equal(preset.strings, null);
    } else {
      assert.equal(preset.strings!.length, 6);
    }
  }
});

test("standard tuning is EADGBE low to high", () => {
  const standard = TUNING_PRESETS.find((p) => p.id === "standard")!.strings!;
  assert.deepEqual(standard.map(noteName), ["E2", "A2", "D3", "G3", "B3", "E4"]);
});

test("drop D tuning only changes the low string relative to standard", () => {
  const standard = TUNING_PRESETS.find((p) => p.id === "standard")!.strings!;
  const dropD = TUNING_PRESETS.find((p) => p.id === "dropD")!.strings!;
  assert.equal(noteName(dropD[0]), "D2");
  assert.deepEqual(dropD.slice(1), standard.slice(1));
});

test("the remaining alternate tuning presets spell out to the expected note names", () => {
  const byId = (id: string) => TUNING_PRESETS.find((p) => p.id === id)!.strings!.map(noteName);
  assert.deepEqual(byId("halfStepDown"), ["D#2", "G#2", "C#3", "F#3", "A#3", "D#4"]);
  assert.deepEqual(byId("openG"), ["D2", "G2", "D3", "G3", "B3", "D4"]);
  assert.deepEqual(byId("openD"), ["D2", "A2", "D3", "F#3", "A3", "D4"]);
  assert.deepEqual(byId("dadgad"), ["D2", "A2", "D3", "G3", "A3", "D4"]);
});
