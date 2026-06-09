import { useState, useEffect, useMemo } from 'react'
import type { LevelConfig } from '../engine/types'
import type { Deck } from '../midi/midiManager'
import { midiManager } from '../midi/midiManager'
import styles from './Preflight.module.css'

interface Props {
  levelConfig: LevelConfig
  onComplete: () => void
}

const PREFLIGHT_TOLERANCE = 0.05

// Human-readable labels for every control the FLX4 can emit
const CONTROL_LABELS: Record<string, string> = {
  PLAY_A:      'Play — Deck A',
  PLAY_B:      'Play — Deck B',
  CUE_A:       'Cue — Deck A',
  CUE_B:       'Cue — Deck B',
  EQ_HI_A:     'EQ High — Deck A',
  EQ_HI_B:     'EQ High — Deck B',
  EQ_MID_A:    'EQ Mid — Deck A',
  EQ_MID_B:    'EQ Mid — Deck B',
  EQ_LOW_A:    'EQ Low — Deck A',
  EQ_LOW_B:    'EQ Low — Deck B',
  FADER_A:     'Channel Fader — Deck A',
  FADER_B:     'Channel Fader — Deck B',
  CROSSFADER:  'Crossfader',
}

// Starting position for each control before a level begins.
// EQ knobs sit at 12 o'clock (0.5); everything else is at minimum (0).
function baselineFor(control: string): number {
  return control.startsWith('EQ_') ? 0.5 : 0
}

function fmt(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

export function Preflight({ levelConfig, onComplete }: Props) {
  // Deduplicated list of controls this level exercises
  const controls = useMemo(
    () => [...new Set(levelConfig.events.map(e => e.control))],
    [levelConfig],
  )

  // null = no MIDI message received yet for that control
  const [values, setValues] = useState<Record<string, number | null>>(
    () => Object.fromEntries(controls.map(c => [c, null])),
  )

  useEffect(() => {
    const update = (control: string, value: number) =>
      setValues(prev => ({ ...prev, [control]: value }))

    // Note: midiManager emits 'play'/'cue' only on Note On (no release event).
    // Buttons initialise to null → not-ready until MIDI confirms their state.
    const onPlay         = (deck: Deck)              => update(`PLAY_${deck}`, 1)
    const onCue          = (deck: Deck)              => update(`CUE_${deck}`, 1)
    const onEqHi         = (deck: Deck, v: number)  => update(`EQ_HI_${deck}`, v)
    const onEqMid        = (deck: Deck, v: number)  => update(`EQ_MID_${deck}`, v)
    const onEqLow        = (deck: Deck, v: number)  => update(`EQ_LOW_${deck}`, v)
    const onChannelFader = (deck: Deck, v: number)  => update(`FADER_${deck}`, v)
    const onCrossfader   = (v: number)              => update('CROSSFADER', v)

    midiManager.on('play',         onPlay)
    midiManager.on('cue',          onCue)
    midiManager.on('eqHi',         onEqHi)
    midiManager.on('eqMid',        onEqMid)
    midiManager.on('eqLow',        onEqLow)
    midiManager.on('channelFader', onChannelFader)
    midiManager.on('crossfader',   onCrossfader)

    return () => {
      midiManager.off('play',         onPlay)
      midiManager.off('cue',          onCue)
      midiManager.off('eqHi',         onEqHi)
      midiManager.off('eqMid',        onEqMid)
      midiManager.off('eqLow',        onEqLow)
      midiManager.off('channelFader', onChannelFader)
      midiManager.off('crossfader',   onCrossfader)
    }
  }, [])

  const rows = controls.map(control => {
    const target  = baselineFor(control)
    const current = values[control]
    const green   = current !== null && Math.abs(current - target) <= PREFLIGHT_TOLERANCE
    return { control, target, current, green }
  })

  const allGreen = rows.length > 0 && rows.every(r => r.green)

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{levelConfig.name}</h2>
      <p className={styles.instruction}>
        Move all controls to match the positions shown
      </p>

      <div className={styles.tableWrap}>
        <div className={`${styles.row} ${styles.header}`}>
          <span>Control</span>
          <span>Target</span>
          <span>Hardware</span>
          <span />
        </div>

        {rows.map(({ control, target, current, green }) => (
          <div
            key={control}
            className={`${styles.row} ${green ? styles.green : styles.pending}`}
          >
            <span className={styles.label}>
              {CONTROL_LABELS[control] ?? control}
            </span>
            <span className={styles.value}>{fmt(target)}</span>
            <span className={styles.value}>
              {current === null ? '—' : fmt(current)}
            </span>
            <span className={styles.status} aria-label={green ? 'ready' : 'not ready'}>
              {green ? '✓' : '○'}
            </span>
          </div>
        ))}
      </div>

      <button
        className={styles.button}
        disabled={!allGreen}
        onClick={onComplete}
      >
        Start Level
      </button>
    </div>
  )
}
