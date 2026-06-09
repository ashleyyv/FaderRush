import type { LevelSession, MidiEvent, ScoredEvent } from './types'

const LOOKAHEAD_MS = 500

// Keyed by session object; auto-released when the session is GC'd.
// Built once on first access (or after resetSession), then maintained
// incrementally — never rebuilt on every scoreInput call.
const scoredCache = new WeakMap<LevelSession, Set<string>>()

function getScoredSet(session: LevelSession): Set<string> {
  let set = scoredCache.get(session)
  if (!set) {
    set = new Set(session.scored.map(s => s.eventId))
    scoredCache.set(session, set)
  }
  return set
}

/** Call this when resetting a session in-place (e.g. retry without a new object). */
export function resetSession(session: LevelSession): void {
  scoredCache.delete(session)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function linearScore(delta: number, tolerance: number): number {
  if (tolerance <= 0) return delta === 0 ? 100 : 0
  return clamp(100 * (1 - delta / tolerance), 0, 100)
}

function nearestCandidate(
  events: MidiEvent[],
  control: string,
  timestamp: number,
  exclude: Set<string>,
): MidiEvent | null {
  let best: MidiEvent | null = null
  let bestDist = Infinity

  for (const e of events) {
    if (e.control !== control) continue
    if (exclude.has(e.id)) continue

    const dist = Math.abs(e.timestamp - timestamp)
    if (dist > LOOKAHEAD_MS) continue
    if (dist < bestDist) {
      best = e
      bestDist = dist
    }
  }

  return best
}

/**
 * Evaluates a single player input against the nearest unscored event on the
 * timeline, pushes the result into session.scored, and returns it.
 *
 * @param session   - active level session (mutated: scored[] is appended)
 * @param control   - control identifier, e.g. 'PLAY_A', 'EQ_HI_B', 'CROSSFADER'
 * @param actualValue - normalised 0–1 value reported by the player's input
 * @param timestamp   - ms elapsed since session.startTime
 * @returns ScoredEvent if a candidate was found, null otherwise
 */
export function scoreInput(
  session: LevelSession,
  control: string,
  actualValue: number,
  timestamp: number,
): ScoredEvent | null {
  const exclude = getScoredSet(session)
  const target  = nearestCandidate(session.events, control, timestamp, exclude)
  if (!target) return null

  const delta =
    target.type === 'note'
      ? Math.abs(timestamp - target.timestamp)      // ms timing error
      : Math.abs(actualValue - target.targetValue)  // normalised value error

  const scored: ScoredEvent = {
    eventId:     target.id,
    actualValue,
    delta,
    score:       linearScore(delta, target.tolerance),
    timestamp,
  }

  session.scored.push(scored)
  exclude.add(target.id)  // maintain incrementally — no rebuild on next call
  return scored
}

/**
 * Returns the mean score across all scored events as a 0–100 number.
 * Returns 0 if nothing has been scored yet.
 */
export function getSessionScore(session: LevelSession): number {
  const { scored } = session
  if (scored.length === 0) return 0
  return scored.reduce((sum, s) => sum + s.score, 0) / scored.length
}
