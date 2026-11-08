> **Direction change (2026-11-08):** audio-to-tab stays as a measured experiment (works on clean single
> notes, see Step 2 notes), not the demo feature. The demo feature is now the **camera fingering check**:
> webcam + MediaPipe hand tracking, 4-point fretboard calibration, per-finger comparison with the chord
> diagram. Steps: 1 camera + skeleton (`/dev/camera`), 2 calibration + fret mapping, 3 chord comparison
> modal in /acordes. Mic + camera fusion is future work for the defense. Prior work to cite: Guitar-Learning
> (github.com/DecoudJuan/Guitar-Learning), JamCam, Burns & Wanderley NIME 2006, ISMIR 2010 audio+video chord
> identification, TapToTab (arXiv 2409.08618).

# Thesis Plan: Audio to Tab

## Why
Professor feedback: the app needs real technical difficulty, and it shouldn't depend on external programs. "How is the user going to get Guitar Pro files?" Answer: PlainChord writes the tab itself, from the user playing or from the user's own recording, entirely on the device.

Principle stays the same: the app describes, never judges. No accounts, no scores, no streaks, no reminders, no adaptive/personalized learning, no stored or shared tabs. Transcription is one tool the user opens when they want it, not more noise on the main screen.

## Already built (reuse, don't redo)
- Internal format every source converges on: `lib/tab.ts` (`Tab`, `TabBeat`, `TabNote`, durations, techniques, tuning)
- Renderer: `components/TabRenderer.tsx`, glossary hover included
- Playback from `Tab`: `lib/tabToScore.ts` + alphaSynth worker, synced playhead
- Guitar Pro import (`lib/importGuitarPro.ts`) and plain-text import (`lib/parseTab.ts`) stay as optional sources
- Monophonic pitch detection: Pitchy (tuner), mic input: `lib/micInput.ts`
- Transition difficulty: `lib/transitionDifficulty.ts` (chord shapes; the fingering cost is a related but separate model)
- Latin notation, Spanish/English

## Pipeline
```
mic / own recording
  -> decode (decodeAudioData, mono, resample)
  -> note events: pitch + onset + offset
       mono: Pitchy + onset detection
       poly: Basic Pitch (Apache 2.0, Web Worker, lazy-loaded)
  -> rhythm quantization (tempo estimate + snap to grid -> durations)
  -> fingering optimizer (DP over string/fret candidates)
  -> Tab -> existing renderer / player / glossary
```
Each stage is a pure function with its own test, so stages can be swapped (Pitchy -> Basic Pitch) without touching the rest.

## Step 1: Fingering optimizer (core algorithm) — done 2026-11-05, `lib/fingering.ts`
- Input: a sequence of note events (MIDI pitch, simultaneous notes grouped), tuning, fret limit
- Candidates: every (string, fret) that produces each pitch; for chords, every non-conflicting assignment (one note per string, playable span)
- Viterbi-style dynamic programming over candidates; cost = fret jump + hand-position shift + string crossing + span, with an open-string bonus
- Output: `TabNote` positions
- Test: known riffs/scales come out in the expected positions; chords never put two notes on one string

## Step 2: Monophonic transcription (demo target) — first version 2026-11-05, `lib/transcribe.ts` + `components/RecordTabModal.tsx`; verified on real Focusrite takes. Pitchy-per-frame failed on a real guitar (strings ring under the next note: no single pitch, weak loudness jump), so detection is now SuperFlux onsets + per-pluck pitch from the spectrum the pluck added (after minus before), harmonic sum with an octave-error check. Legato (hammer-on/slide, no pluck) is not detected: Step 4. Band-pass filter not built (not needed so far)
- Pitchy over short frames -> pitch track
- Onset detection (spectral flux or energy rise) to split notes; merge frames of the same pitch
- Metronome with count-in (part of this step, not an extra): quantizing against a user-set BPM only works if the user played against a click. Audible count-in before recording; during recording a visual pulse, or the click on headphones, so the click doesn't leak into the mic and register as onsets
- Quantization: user-set or tapped BPM first, automatic tempo estimate later. Onset detection + quantization is where the time goes, so keep both simple first
- Optional: a band-pass filter (about 80 Hz to 5 kHz, Web Audio `BiquadFilterNode`) on mic input for noisy rooms. No other noise cleanup
- Output `Tab` -> render -> play back so the user compares what the app heard with what they played
- UI: one entry point ("Escuchar y escribir"), record/stop, result in the existing tab view

## Step 3: Polyphonic transcription (Basic Pitch)
- `@spotify/basic-pitch` in a Web Worker, model lazy-loaded and cached
- Group simultaneous notes into beats, feed the same quantizer and optimizer
- Fallback if it doesn't integrate cleanly in time: ship Step 2 only and present this as in progress

## Step 4: Technique detection from the pitch curve
- Bend: smooth rise (and release) within one note -> `b`, `bendAmount`
- Slide: glide between two stable pitches -> `/`
- Vibrato: periodic oscillation -> `~`
- Stretch within this step: hammer-on/pull-off from a new pitch with no new onset energy -> `h` / `p`. Unreliable with Pitchy, so only if bends/slides/vibrato are solid first
- Tags are the glossary symbols, so the hover explanations work on transcribed tabs for free

## Step 5: Accuracy measurement (defense material)
- Transcription: note-level precision/recall/F1 with the standard 50 ms onset tolerance (the mir_eval convention), so the panel recognizes the numbers. Material: recordings made on purpose against known tabs, and GuitarSet (CC BY 4.0)
- Fingering: string/fret match rate against GuitarSet annotations, compared with a naive baseline (always the lowest fret), plus an ablation removing one cost term at a time to show the DP and each term earn their place
- Offline script, nothing shipped to the app
- State the limits honestly: clean single-guitar recordings work, full-band mixes don't

## Legal stance
- Audio is processed on the device and never uploaded; no server involved
- Input is the user playing or the user's own recording; no YouTube/streaming input, no source separation
- The resulting tab is local only, same rules as imported tabs (see `no-hosting-rule`)

## Timeline
- Demo (~2026-11-19): Steps 1 and 2. "Play a riff, watch the tab appear, play it back."
- After the demo, for the defense: Step 3, Step 4, Step 5
- Small extra only if time is left: A-B loop

## Out of scope (mention as future work, don't promise)
- Camera-based fingering detection (MediaPipe Hands), fused with audio to resolve string/fret ambiguity
- Learned fingering model trained on GuitarSet instead of a hand-tuned cost
- Own plucked-string synth (Karplus-Strong) replacing alphaSynth playback
- Exercise generator (progression + pattern -> Tab), reusing the optimizer

## Defense framing
The minimalism is a deliberate design decision; the technical depth sits behind one button. PlainChord doesn't depend on tab files or external programs: it listens and writes the tab itself, with signal processing and ML for note detection, rhythm quantization, and a dynamic-programming fingering optimizer, all running in the browser. Imports remain a convenience.
