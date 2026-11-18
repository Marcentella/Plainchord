/**
 * Saves audio as a 16-bit mono WAV — behind ?debug (same idea as
 * /acordes?demo), for tuning thresholds against a real guitar instead of
 * guessing: lib/transcribe.ts's (components/RecordTabModal.tsx) and
 * lib/stringCheck.ts's (the camera check's strums). Stays on the device.
 */
export function downloadWav(samples: Float32Array, sampleRate: number, name: string) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
