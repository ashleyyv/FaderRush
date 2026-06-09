export interface MidiEvent {
  id: string
  type: 'note' | 'cc'
  control: string       // e.g. 'PLAY_A', 'FADER_A', 'EQ_LOW_A'
  targetValue: number   // normalised 0–1
  tolerance: number     // normalised 0–1 for cc; ms for note timing
  timestamp: number     // ms from track start
  durationMs?: number   // for held controls (faders, EQ)
}

export interface ScoredEvent {
  eventId: string
  actualValue: number
  delta: number         // distance from targetValue
  score: number         // 0–100
  timestamp: number     // when player input arrived
}

export interface AudioTracks {
  deckA: string         // asset path
  deckB: string         // asset path
}

export interface LevelConfig {
  id: string
  name: string
  bpm: number
  totalBars: number
  audioTracks: AudioTracks
  events: MidiEvent[]
}

export type LevelStatus = 'preflight' | 'playing' | 'complete'

export interface LevelSession {
  levelId: string
  startTime: number     // performance.now() at level start
  events: MidiEvent[]
  scored: ScoredEvent[]
  status: LevelStatus
}
