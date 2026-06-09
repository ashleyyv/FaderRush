# FaderRush — Project Reference

DJ rhythm game built with React + TypeScript + Vite. The player uses a physical
DJ controller (Numark FLX4) to match MIDI cues scored against a timeline.

---

## V1 Design Scope

FaderRush V1 is tailored for **house music DJs**. Levels are structured around
the core blend technique: managing channel faders and EQ across a standard
32-bar phrase.

**Primary scored mechanics (V1):**
- Channel faders (`FADER_A`, `FADER_B`) — linear fade moves, blend crossings
- EQ knobs (`EQ_HI_*`, `EQ_MID_*`, `EQ_LOW_*`) — frequency cuts and boosts

**Mapped but unscored in V1:**
- Crossfader — wired through `midiAudioBridge` and affects audio output
  multiplicatively, but no `LevelConfig` events target `CROSSFADER`. It is
  intentionally left as a free control so the player can use it naturally
  without it being graded.

---

## Folder Structure

```
src/
├── midi/
│   └── midiManager.ts        — Web MIDI access; parses FLX4 messages; emits
│                               typed events via on/off callback system
├── audio/
│   └── audioEngine.ts        — Web Audio API; loads/decodes deck buffers;
│                               play/pause/setGain/setEQ per deck; singleton
├── engine/
│   ├── types.ts              — Core interfaces: MidiEvent, ScoredEvent,
│   │                           LevelConfig, LevelSession, LevelStatus
│   ├── level1.json           — Hardcoded Level 1 config ("The Drop", 128 BPM,
│   │                           32 bars); PLAY_A events every 8 bars
│   ├── scoringEngine.ts      — scoreInput() matches player input to nearest
│   │                           timeline event; getSessionScore() returns mean
│   ├── midiAudioBridge.ts    — startBridge()/stopBridge(); wires midiManager
│   │                           events to audioEngine; multiplicative gain
│   └── gameLoop.ts           — createGameLoop() factory; owns session lifetime,
│                               rAF tick loop, MIDI→scoring subscriptions
├── components/
│   ├── Preflight.tsx         — Pre-level hardware check; shows target vs live
│   │   Preflight.module.css    hardware value per control; unlocks Start Level
│   ├── NoteHighway.tsx       — Canvas-based scrolling note highway; rAF render
│   │   NoteHighway.module.css  loop; propsRef pattern for zero-overhead updates
│   ├── Level1.tsx            — Top-level Level 1 component; owns preflight →
│   │   Level1.module.css       playing → results state machine
│   └── (future levels here)
├── levels/                   — Reserved for additional level configs (empty)
├── assets/                   — Static assets: audio files go here (empty)
├── App.tsx                   — Placeholder; not yet wired to Level1
├── index.css                 — Global reset + dark theme base
├── main.tsx                  — React root mount
└── vite-env.d.ts             — Vite client type reference
```

---

## Control Naming Convention

Control strings are used as the bridge between MIDI events, level configs, the
scoring engine, and the preflight checklist. They must match exactly.

| String        | Hardware control              |
|---------------|-------------------------------|
| `PLAY_A`      | Play/Pause button — Deck A    |
| `PLAY_B`      | Play/Pause button — Deck B    |
| `CUE_A`       | Cue button — Deck A           |
| `CUE_B`       | Cue button — Deck B           |
| `EQ_HI_A`     | EQ High knob — Deck A         |
| `EQ_HI_B`     | EQ High knob — Deck B         |
| `EQ_MID_A`    | EQ Mid knob — Deck A          |
| `EQ_MID_B`    | EQ Mid knob — Deck B          |
| `EQ_LOW_A`    | EQ Low knob — Deck A          |
| `EQ_LOW_B`    | EQ Low knob — Deck B          |
| `FADER_A`     | Channel fader — Deck A        |
| `FADER_B`     | Channel fader — Deck B        |
| `CROSSFADER`  | Crossfader                    |

**Preflight baselines:** `EQ_*` → 0.5 (12 o'clock), all others → 0.

**Scoring delta units:** `note`-type events use ms (timing); `cc`-type events
use normalised 0–1 float (value distance).

---

## FLX4 MIDI Map

All values normalised to 0–1 before leaving `midiManager`.

### Buttons (Note On/Off, 0x90 / 0x80)

| Control   | MIDI Channel | Note |
|-----------|-------------|------|
| Play/Pause Deck A | 1 (idx 0) | 11 |
| Play/Pause Deck B | 2 (idx 1) | 11 |
| Cue Deck A        | 1 (idx 0) | 12 |
| Cue Deck B        | 2 (idx 1) | 12 |

Note: `midiManager` emits `play`/`cue` on Note On (velocity > 0) only. Note
Off is not currently forwarded — play/pause is toggled per press in the bridge.

### Faders & Knobs (14-bit CC pairs, 0xB0)

14-bit resolution: MSB on CC N, LSB on CC N+32. The MSB is buffered until the
LSB arrives; combined value is `(msb << 7 | lsb) / 16383` → 0–1.

| Control           | Ch   | MSB CC | LSB CC |
|-------------------|------|--------|--------|
| EQ High — Deck A  | 1    | 7      | 39     |
| EQ High — Deck B  | 2    | 7      | 39     |
| EQ Mid — Deck A   | 1    | 11     | 43     |
| EQ Mid — Deck B   | 2    | 11     | 43     |
| EQ Low — Deck A   | 1    | 15     | 47     |
| EQ Low — Deck B   | 2    | 15     | 47     |
| Channel Fader A   | 1    | 19     | 51     |
| Channel Fader B   | 2    | 19     | 51     |
| Crossfader        | 7    | 31     | 63     |

### EQ Filter Parameters (`audioEngine.setEQ`)

| Band  | Filter type  | Frequency | Gain range       |
|-------|-------------|-----------|------------------|
| `hi`  | highshelf   | 3200 Hz   | −12 dB … +12 dB  |
| `mid` | peaking     | 1000 Hz   | −12 dB … +12 dB  |
| `low` | lowshelf    | 200 Hz    | −12 dB … +12 dB  |

`value 0.5 = 0 dB (flat)`. Formula: `gainDb = (value - 0.5) * 24`.

---

## Key Architectural Decisions

### WeakMap scored-ID cache (`scoringEngine.ts`)
`scoredCache: WeakMap<LevelSession, Set<string>>` stores the set of already-
scored event IDs keyed by the session object. Built once on first access, then
maintained incrementally (`exclude.add(id)` after each score). Never rebuilt
on every `scoreInput` call. When the session object is GC'd (level complete,
new game), the entry is released automatically. `resetSession()` handles the
in-place-mutation case (retry without a new object).

### `propsRef` pattern (`NoteHighway.tsx`)
The canvas rAF loop runs inside a single `useEffect([], [])`. Putting `session`
or `currentTime` in the deps array would cancel and restart the loop on every
React render — defeating the point. Instead, `propsRef.current = { session,
currentTime }` is written on every React render (outside the effect). The loop
reads `propsRef.current` each frame, always getting the latest props with no
stale closures and no loop restarts.

### Multiplicative gain (`midiAudioBridge.ts`)
`finalGain = channelFader[deck] * crossfaderGain(deck)`
where `crossfaderGain('A') = 1 - crossfader` and `crossfaderGain('B') = crossfader`.
The bridge caches both values. When the channel fader changes, only that deck's
gain is recomputed. When the crossfader changes, both decks are recomputed.
Crossfader curve is linear; substitute `xfGain()` for constant-power if needed.

### Factory, not singleton (`gameLoop.ts`)
`createGameLoop(config, callbacks)` returns a fresh closure with independent
`session`, `rafId`, `running`, and `aborted` state. Singleton game loops
accumulate state across level restarts and make retry/teardown fragile.
The factory pattern means each level run is fully isolated; the caller calls
`stop()` on the previous instance before creating a new one.

### `aborted` flag for async-safe teardown (`gameLoop.ts`)
`start()` contains two `await` points (audio init + play). If `stop()` is
called during either, `running` is still `false` (set only after all setup).
`cancelAnimationFrame` would be a no-op, and audio would still start. The
`aborted` flag is set synchronously by `stop()` and checked after each await,
so the async path exits cleanly.

### Static Web Audio node graph, dynamic source nodes (`audioEngine.ts`)
`GainNode` and three `BiquadFilterNode`s are created once per deck and stay
permanently connected (`low → mid → hi → gain → destination`). Only
`AudioBufferSourceNode`s are recreated on each `play()` call — the Web Audio
spec mandates this (source nodes are single-use). New sources attach to
`lowFilter` as the graph entry point.

---

## Current Build State

| File | Status |
|------|--------|
| `src/midi/midiManager.ts`       | ✅ Complete |
| `src/audio/audioEngine.ts`      | ✅ Complete |
| `src/engine/types.ts`           | ✅ Complete |
| `src/engine/level1.json`        | ✅ Complete |
| `src/engine/level2.json`        | ✅ Complete |
| `src/engine/level3.json`        | ✅ Complete |
| `src/engine/scoringEngine.ts`   | ✅ Complete |
| `src/engine/midiAudioBridge.ts` | ✅ Complete |
| `src/engine/gameLoop.ts`        | ✅ Complete |
| `src/components/Preflight.tsx`  | ✅ Complete |
| `src/components/NoteHighway.tsx`| ✅ Complete |
| `src/components/Level1.tsx`     | ✅ Complete |
| `src/App.tsx`                   | ✅ Mounts `<Level1 />` |
| `public/assets/deckA.mp3`       | ⚠️ Silent placeholder (WAV in .mp3, gitignored) |
| `public/assets/deckB.mp3`       | ⚠️ Silent placeholder (WAV in .mp3, gitignored) |
| `src/levels/`                   | ❌ Empty — reserved for future levels |

---

## Not Yet Built

- **Audio assets** — `public/assets/deckA.mp3` and `deckB.mp3` are 60-second
  silent WAV containers with `.mp3` extension (generated placeholder, gitignored).
  Replace with real tracks; `decodeAudioData` reads magic bytes so any supported
  format works regardless of extension.

- **Level 2+** — `src/levels/` is empty. Additional levels need a JSON config
  following the `LevelConfig` interface and a corresponding React component (or
  a generic `LevelRunner` component driven by config).

- **Note Off / button release** — `midiManager` only emits on Note On. Play/pause
  is currently a toggle (each press flips state). True hold-to-play requires
  Note Off handling to be added to `midiManager.handleNote`.

- **Level select / routing** — no navigation between levels. Currently the entire
  app is Level 1 only.

- **Score persistence** — no localStorage or backend save. Scores are lost on
  page refresh.

- **Visual polish** — NoteHighway renders functional but minimal. No lane
  labels, no beat markers, no combo multiplier display.

---

## Timing Reference (128 BPM)

| Unit        | Duration  |
|-------------|-----------|
| 1 beat      | 468.75 ms |
| 1 bar       | 1875 ms   |
| 8 bars      | 15 000 ms |
| 32 bars     | 60 000 ms |

PLAY_A events in Level 1 land at: **0 ms, 15 000 ms, 30 000 ms, 45 000 ms**
(bars 0, 8, 16, 24). Tolerance: ±150 ms.

**Level 3 — The Swap:** the final checkpoint (bar 32, 60 000 ms) coincides with
`levelDurationMs`. The game loop calls `complete()` on the first tick where
`t >= 60 000`, so bar-32 events are scoreable only if the player moves the EQ
before that tick fires (~16 ms window at 60 fps). Treat bar 32 as a grace
checkpoint — unscored is acceptable; the prior 8 checkpoints carry the grade.
