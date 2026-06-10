import { useState, useEffect, useRef, useCallback } from 'react'
import type { LevelConfig, LevelSession } from '../engine/types'
import { createGameLoop } from '../engine/gameLoop'
import type { GameLoop } from '../engine/gameLoop'
import { midiManager } from '../midi/midiManager'
import { getSessionScore } from '../engine/scoringEngine'
import { Preflight } from './Preflight'
import { NoteHighway } from './NoteHighway'
import styles from './Level1.module.css'

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
  levelName: string
  onRetry: () => void
  onBack: () => void
}

function ResultsView({ session, levelName, onRetry, onBack }: ResultsProps) {
  const finalScore    = getSessionScore(session)
  const scoredByEvent = new Map(session.scored.map(s => [s.eventId, s]))

  return (
    <div className={styles.results}>
      <h2 className={styles.resultsTitle}>{levelName}</h2>

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

      <div className={styles.actions}>
        <button className={styles.backBtn} onClick={onBack}>← Menu</button>
        <button className={styles.retryBtn} onClick={onRetry}>Retry</button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface Level1Props {
  levelConfig: LevelConfig
  onBack: () => void
}

export function Level1({ levelConfig, onBack }: Level1Props) {
  const [phase,        setPhase]        = useState<Phase>('preflight')
  const [currentTime,  setCurrentTime]  = useState(0)
  const [meanScore,    setMeanScore]    = useState(0)
  const [finalSession, setFinalSession] = useState<LevelSession | null>(null)

  const loopRef      = useRef<GameLoop | null>(null)
  const midiReadyRef = useRef(false)

  // ── Transition: preflight → playing ────────────────────────────────────
  const startPlaying = useCallback(async () => {
    if (!midiReadyRef.current) {
      await midiManager.init()
      midiReadyRef.current = true
    }

    const loop = createGameLoop(levelConfig, {
      onTick: setCurrentTime,

      onScore: () => {
        const s = loopRef.current?.session
        if (s) setMeanScore(getSessionScore(s))
      },

      onComplete: () => {
        const s = loopRef.current?.session
        setFinalSession(s ?? null)
        setPhase('results')
        if (s) {
          const score = getSessionScore(s)
          const key   = `faderrush_best_${levelConfig.id}`
          const prev  = parseFloat(localStorage.getItem(key) ?? '0')
          if (score > prev) localStorage.setItem(key, score.toString())
        }
      },
    })

    loopRef.current = loop
    void loop.start()
    setPhase('playing')
  }, [levelConfig])

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
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={onBack}>← Menu</button>
        </div>
        <Preflight levelConfig={levelConfig} onComplete={startPlaying} />
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
          <span className={styles.hudLevel}>{levelConfig.name}</span>
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
        <ResultsView
          session={finalSession}
          levelName={levelConfig.name}
          onRetry={retry}
          onBack={onBack}
        />
      </div>
    )
  }

  return null
}
