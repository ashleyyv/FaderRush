import { useEffect, useRef } from 'react'
import type { LevelSession, MidiEvent, ScoredEvent } from '../engine/types'
import styles from './NoteHighway.module.css'

export interface Props {
  session: LevelSession
  currentTime: number   // ms from track start
}

const LOOKAHEAD_MS  = 2000
const NOTE_HEIGHT   = 14
const CANVAS_HEIGHT = 400
const LANE_PAD      = 5

function colorForControl(control: string): string {
  if (control.startsWith('PLAY') || control.startsWith('CUE'))         return '#9c27b0' // purple
  if (control.startsWith('FADER') || control === 'CROSSFADER')         return '#009688' // teal
  if (control.startsWith('EQ'))                                         return '#ff9800' // amber
  return '#616161'
}

function buildLaneMap(events: MidiEvent[]): Map<string, number> {
  const seen = new Map<string, number>()
  for (const e of events) {
    if (!seen.has(e.control)) seen.set(e.control, seen.size)
  }
  return seen
}

function buildScoredMap(scored: ScoredEvent[]): Map<string, ScoredEvent> {
  return new Map(scored.map(s => [s.eventId, s]))
}

function drawFrame(
  canvas: HTMLCanvasElement,
  session: LevelSession,
  currentTime: number,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  const hitZoneY    = height * 0.9
  const trackHeight = hitZoneY

  // ── Background ────────────────────────────────────────────────
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, width, height)

  // ── Hit zone ──────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, hitZoneY, width, height - hitZoneY)

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, hitZoneY)
  ctx.lineTo(width, hitZoneY)
  ctx.stroke()

  // ── Lane setup ────────────────────────────────────────────────
  const laneMap   = buildLaneMap(session.events)
  const numLanes  = Math.max(laneMap.size, 1)
  const laneWidth = width / numLanes

  // Lane separator lines
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  for (let i = 1; i < numLanes; i++) {
    const x = Math.round(i * laneWidth)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // ── Notes ─────────────────────────────────────────────────────
  const scoredMap = buildScoredMap(session.scored)

  for (const event of session.events) {
    // y = hitZoneY when event.timestamp === currentTime
    // y = 0       when event.timestamp === currentTime + lookaheadMs
    const y = hitZoneY - ((event.timestamp - currentTime) / LOOKAHEAD_MS) * trackHeight

    // Cull notes that are fully off-canvas
    if (y < -NOTE_HEIGHT || y > height + NOTE_HEIGHT) continue

    const lane  = laneMap.get(event.control) ?? 0
    const x     = lane * laneWidth + LANE_PAD
    const noteW = laneWidth - LANE_PAD * 2
    const noteY = y - NOTE_HEIGHT / 2

    const scored = scoredMap.get(event.id)
    const fill   = scored
      ? scored.score >= 70 ? '#66bb6a' : '#ef5350'
      : colorForControl(event.control)

    // Note body
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(x, noteY, noteW, NOTE_HEIGHT, 3)
    ctx.fill()

    // Highlight stripe (top edge gleam)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(x + 2, noteY + 2, noteW - 4, 2)

    // Scored glow ring
    if (scored) {
      ctx.strokeStyle = fill
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.roundRect(x - 2, noteY - 2, noteW + 4, NOTE_HEIGHT + 4, 4)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
}

export function NoteHighway({ session, currentTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Props ref lets the rAF loop always read the latest values
  // without being torn down and recreated on every render.
  const propsRef = useRef({ session, currentTime })
  propsRef.current = { session, currentTime }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.height = CANVAS_HEIGHT

    // Keep canvas pixel width in sync with its layout width
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) canvas.width = Math.floor(w)
    })
    observer.observe(canvas)
    canvas.width = Math.floor(canvas.getBoundingClientRect().width) || 800

    let rafId = 0

    const loop = () => {
      drawFrame(canvas, propsRef.current.session, propsRef.current.currentTime)
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, []) // intentionally empty — loop reads live data from propsRef

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      aria-label="Note highway"
    />
  )
}
