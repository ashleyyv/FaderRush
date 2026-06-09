import type { Deck } from '../midi/midiManager'
import { midiManager } from '../midi/midiManager'
import { audioEngine } from '../audio/audioEngine'
import { startBridge, stopBridge } from './midiAudioBridge'
import { scoreInput } from './scoringEngine'
import type { LevelConfig, LevelSession, ScoredEvent } from './types'

export interface GameLoopCallbacks {
  onScore:    (event: ScoredEvent) => void
  onComplete: () => void
  onTick:     (currentTime: number) => void
}

export interface GameLoop {
  start():  Promise<void>
  stop():   void
  readonly session: LevelSession | null
}

export function createGameLoop(
  config:    LevelConfig,
  callbacks: GameLoopCallbacks,
): GameLoop {
  let session:   LevelSession | null = null
  let startTime  = 0
  let rafId      = 0
  let running    = false
  let aborted    = false   // set by stop() to abort a mid-flight start()

  // Total track length: 4 beats × (60 000 ms / bpm) × totalBars
  const levelDurationMs = (4 * (60_000 / config.bpm)) * config.totalBars

  // ── Helpers ───────────────────────────────────────────────────────────

  function elapsed(): number {
    return performance.now() - startTime
  }

  function handle(scored: ScoredEvent | null): void {
    if (!scored) return
    callbacks.onScore(scored)
    // Complete as soon as every event in the level has been scored
    if (session && session.scored.length >= session.events.length) {
      complete()
    }
  }

  function complete(): void {
    if (!running) return   // guard against double-fire (e.g. last event + rAF)
    if (session) session.status = 'complete'
    stop()
    callbacks.onComplete()
  }

  // ── MIDI → scoring handlers (stable references required for on/off) ───

  function onPlay(deck: Deck): void {
    if (!session || !running) return
    handle(scoreInput(session, `PLAY_${deck}`, 1, elapsed()))
  }

  function onCue(deck: Deck): void {
    if (!session || !running) return
    handle(scoreInput(session, `CUE_${deck}`, 1, elapsed()))
  }

  function onEqHi(deck: Deck, value: number): void {
    if (!session || !running) return
    handle(scoreInput(session, `EQ_HI_${deck}`, value, elapsed()))
  }

  function onEqMid(deck: Deck, value: number): void {
    if (!session || !running) return
    handle(scoreInput(session, `EQ_MID_${deck}`, value, elapsed()))
  }

  function onEqLow(deck: Deck, value: number): void {
    if (!session || !running) return
    handle(scoreInput(session, `EQ_LOW_${deck}`, value, elapsed()))
  }

  function onChannelFader(deck: Deck, value: number): void {
    if (!session || !running) return
    handle(scoreInput(session, `FADER_${deck}`, value, elapsed()))
  }

  function onCrossfader(value: number): void {
    if (!session || !running) return
    handle(scoreInput(session, 'CROSSFADER', value, elapsed()))
  }

  function subscribe(): void {
    midiManager.on('play',         onPlay)
    midiManager.on('cue',          onCue)
    midiManager.on('eqHi',         onEqHi)
    midiManager.on('eqMid',        onEqMid)
    midiManager.on('eqLow',        onEqLow)
    midiManager.on('channelFader', onChannelFader)
    midiManager.on('crossfader',   onCrossfader)
  }

  function unsubscribe(): void {
    midiManager.off('play',         onPlay)
    midiManager.off('cue',          onCue)
    midiManager.off('eqHi',         onEqHi)
    midiManager.off('eqMid',        onEqMid)
    midiManager.off('eqLow',        onEqLow)
    midiManager.off('channelFader', onChannelFader)
    midiManager.off('crossfader',   onCrossfader)
  }

  // ── rAF tick loop ─────────────────────────────────────────────────────

  function tick(): void {
    if (!running) return
    const t = elapsed()
    callbacks.onTick(t)
    // Auto-complete when the track has fully played out
    if (t >= levelDurationMs) { complete(); return }
    rafId = requestAnimationFrame(tick)
  }

  // ── Public API ────────────────────────────────────────────────────────

  async function start(): Promise<void> {
    if (running) return

    aborted   = false
    startTime = performance.now()

    session = {
      levelId:   config.id,
      startTime,
      events:    [...config.events],  // copy — never mutate the config
      scored:    [],
      status:    'playing',
    }

    await audioEngine.init(config.audioTracks.deckA, config.audioTracks.deckB)
    if (aborted) return

    await audioEngine.play('A')
    await audioEngine.play('B')
    if (aborted) return

    startBridge()
    subscribe()

    running = true
    rafId   = requestAnimationFrame(tick)
  }

  function stop(): void {
    aborted = true
    running = false
    cancelAnimationFrame(rafId)
    audioEngine.pause('A')
    audioEngine.pause('B')
    stopBridge()
    unsubscribe()
  }

  return {
    get session() { return session },
    start,
    stop,
  }
}
