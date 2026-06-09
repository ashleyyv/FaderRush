import type { Deck } from '../midi/midiManager'
import { midiManager } from '../midi/midiManager'
import { audioEngine } from '../audio/audioEngine'

// ── Tracked state ─────────────────────────────────────────────────────────
// Initialised to match the preflight baseline (faders=0, crossfader=0).
// These values are updated on every MIDI event so combined gain stays correct
// even when only one of the two inputs changes.

const fader: Record<Deck, number> = { A: 0, B: 0 }
let crossfader = 0

// Play/pause toggle state — midiManager emits 'play' on Note On only (no
// Note Off), so each press flips the deck between playing and paused.
const playing = new Set<Deck>()

// ── Gain helpers ──────────────────────────────────────────────────────────

function xfGain(deck: Deck): number {
  return deck === 'A' ? 1 - crossfader : crossfader
}

function applyGain(deck: Deck): void {
  // final gain = channelFader × crossfaderGain (multiplicative)
  audioEngine.setGain(deck, fader[deck] * xfGain(deck))
}

// ── Handlers (stable function references required for on/off symmetry) ────

function onPlay(deck: Deck): void {
  if (playing.has(deck)) {
    audioEngine.pause(deck)
    playing.delete(deck)
  } else {
    void audioEngine.play(deck)
    playing.add(deck)
  }
}

function onEqHi(deck: Deck, value: number): void {
  audioEngine.setEQ(deck, 'hi', value)
}

function onEqMid(deck: Deck, value: number): void {
  audioEngine.setEQ(deck, 'mid', value)
}

function onEqLow(deck: Deck, value: number): void {
  audioEngine.setEQ(deck, 'low', value)
}

function onChannelFader(deck: Deck, value: number): void {
  fader[deck] = value
  applyGain(deck)  // only this deck's gain changes
}

function onCrossfader(value: number): void {
  crossfader = value
  applyGain('A')   // both decks' gain changes
  applyGain('B')
}

// ── Public API ────────────────────────────────────────────────────────────

/** Attach all MIDI → audio listeners. Resets internal state on each call. */
export function startBridge(): void {
  // Reset to preflight baseline so cached state matches hardware
  fader.A    = 0
  fader.B    = 0
  crossfader = 0
  playing.clear()

  midiManager.on('play',         onPlay)
  midiManager.on('eqHi',         onEqHi)
  midiManager.on('eqMid',        onEqMid)
  midiManager.on('eqLow',        onEqLow)
  midiManager.on('channelFader', onChannelFader)
  midiManager.on('crossfader',   onCrossfader)
}

/** Detach all listeners, pause any playing decks, and reset state. */
export function stopBridge(): void {
  midiManager.off('play',         onPlay)
  midiManager.off('eqHi',         onEqHi)
  midiManager.off('eqMid',        onEqMid)
  midiManager.off('eqLow',        onEqLow)
  midiManager.off('channelFader', onChannelFader)
  midiManager.off('crossfader',   onCrossfader)

  for (const deck of playing) audioEngine.pause(deck)
  playing.clear()
}
