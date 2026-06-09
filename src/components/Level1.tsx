import { useState, useEffect, useRef, useCallback } from 'react'
import level1Json from '../engine/level1.json'
import type { LevelConfig, LevelSession } from '../engine/types'
import { createGameLoop } from '../engine/gameLoop'
import type { GameLoop } from '../engine/gameLoop'
import { midiManager } from '../midi/midiManager'
import { getSessionScore } from '../engine/scoringEngine'
import { Preflight } from './Preflight'
import { NoteHighway } from './NoteHighway'
import styles from './Level1.module.css'

// Cast once at module level — JSON matches LevelConfig, tsc can't infer the literal union
const config = level1Json as unknown as LevelConfig

type Phase = 'preflight' | 'playing' | 'results'

// ── Results sub-component ─────────────────────────────────────────────────

const CONTROL_LABELS: Record<string, string> = {
  PLAY_A: 'Play — Deck A',      PLAY_B: 'Play — Deck B',
  CUE_A:  'Cue — Deck A',       CUE_B:  'Cue — Deck B',
  EQ_HI_A:  'EQ High — Deck A', EQ_HI_B:  'EQ High — Deck B',
  EQ_MID_A: 'EQ Mid — Deck A',  EQ_MID_B: 'EQ Mid — Deck B',
  EQ_LOW_A: 'EQ Low — Deck A',  EQ_LOW_B: 'EQ Low — Deck B',
  FADER_A:  'Channel Fader — Deck A', FADER_B: 'Channel Fader — Deck B',
  CROSSFADER: 'Crossfader',
}

interface ResultsProps {
  session: LevelSession
  onRetry: () => void
}

function ResultsView({ session, onRetry }: ResultsProps) {
  const finalScore   = getSessionScore(session)
  const scoredByEvent = new Map(session.scored.map(s => [s.eventId, s]))

  return (
    <div className={styles.results}>
      <h2 className={styles.resultsTitle}>{config.name}</h2>

      <div className={styles.finalScoreWrap}>
        <span className={styles.finalScoreLabel}>Final Score</span>
        <span
          className={`${styles.finalScore} ${
            finalScore >= 70 ? styles.scoreGreen : finalScore >= 40 ? styles.scoreAmber : styles.scoreRed
          }`}
        >
          {finalScore.toFixed(0)}
        </span>
      </div>

      {/* Per-event breakdown */}
      <div className={styles.breakdown}>
        <div className={`${styles.bRow} ${styles.bHeader}`}>
          <span>Control</span>
          <span>Target</span>
          <span>Score</span>
          <span>Delta</span>
        </div>

        {session.events.map(event => {
          const scored = scoredByEvent.get(event.id)
          const rowClass = scored
            ? scored.score >= 70 ? styles.bHit : styles.bMiss
            : styles.bUnscored

          return (
            <div key={event.id} className={`${styles.bRow} ${rowClass}`}>
              <span>{CONTROL_LABELS[event.control] ?? event.control}</span>
              <span>{(event.timestamp / 1000).toFixed(2)}s</span>
              <span>{scored ? scored.score.toFixed(0) : '—'}</span>
              <span>
                {scored
                  ? event.type === 'note'
                    ? `${scored.delta.toFixed(0)} ms`
                    : scored.delta.toFixed(3)
                  : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <button className={styles.retryBtn} onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function Level1() {
  const [phase,        setPhase]        = useState<Phase>('preflight')
  const [currentTime,  setCurrentTime]  = useState(0)
  const [meanScore,    setMeanScore]    = useState(0)
  const [finalSession, setFinalSession] = useState<LevelSession | null>(null)

  const loopRef      = useRef<GameLoop | null>(null)
  const midiReadyRef = useRef(false)

  // ── Transition: preflight → playing ────────────────────────────────────
  const startPlaying = useCallback(async () => {
    // AudioContext and MIDI access both require a prior user gesture — this
    // callback is always triggered by the "Start Level" button click.
    if (!midiReadyRef.current) {
      await midiManager.init()
      midiReadyRef.current = true
    }

    const loop = createGameLoop(config, {
      onTick: setCurrentTime,

      onScore: () => {
        // session.scored was already mutated by scoreInput before this fires
        const s = loopRef.current?.session
        if (s) setMeanScore(getSessionScore(s))
      },

      onComplete: () => {
        const s = loopRef.current?.session
        setFinalSession(s ?? null)
        setPhase('results')
      },
    })

    loopRef.current = loop
    void loop.start()   // session is created synchronously before first await
    setPhase('playing')
  }, [])

  // ── Transition: results → preflight (retry) ─────────────────────────────
  const retry = useCallback(() => {
    loopRef.current?.stop()
    loopRef.current = null
    setCurrentTime(0)
    setMeanScore(0)
    setFinalSession(null)
    setPhase('preflight')
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => () => { loopRef.current?.stop() }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  if (phase === 'preflight') {
    return (
      <div className={styles.container}>
        <Preflight levelConfig={config} onComplete={startPlaying} />
      </div>
    )
  }

  if (phase === 'playing') {
    const session = loopRef.current?.session
    if (!session) {
      return <div className={styles.container}><p className={styles.loading}>Loading…</p></div>
    }

    return (
      <div className={styles.container}>
        <div className={styles.hud}>
          <span className={styles.hudLevel}>{config.name}</span>
          <div className={styles.hudScore}>
            <span className={styles.hudScoreLabel}>Score</span>
            <span className={styles.hudScoreValue}>{meanScore.toFixed(0)}</span>
          </div>
        </div>
        <NoteHighway session={session} currentTime={currentTime} />
      </div>
    )
  }

  if (phase === 'results' && finalSession) {
    return (
      <div className={styles.container}>
        <ResultsView session={finalSession} onRetry={retry} />
      </div>
    )
  }

  return null
}
