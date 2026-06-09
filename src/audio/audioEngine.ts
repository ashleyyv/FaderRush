export type EQBand = 'low' | 'mid' | 'hi'

type Deck = 'A' | 'B'

const EQ_GAIN_RANGE_DB = 12  // value 0.5 = 0 dB, 0 = -12 dB, 1 = +12 dB

interface DeckState {
  buffer:      AudioBuffer | null
  source:      AudioBufferSourceNode | null
  gainNode:    GainNode
  lowFilter:   BiquadFilterNode
  midFilter:   BiquadFilterNode
  hiFilter:    BiquadFilterNode
  isPlaying:   boolean
  pauseOffset: number  // seconds into the buffer
  startTime:   number  // ctx.currentTime at last play()
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private decks: Record<Deck, DeckState> | null = null

  /**
   * Must be called from a user-gesture handler.
   * Creates the AudioContext, wires up nodes, and decodes both tracks.
   */
  async init(deckAPath: string, deckBPath: string): Promise<void> {
    if (this.ctx) return

    this.ctx = new AudioContext()

    this.decks = {
      A: this.createDeckNodes(),
      B: this.createDeckNodes(),
    }

    const [bufA, bufB] = await Promise.all([
      this.loadBuffer(deckAPath),
      this.loadBuffer(deckBPath),
    ])

    this.decks.A.buffer = bufA
    this.decks.B.buffer = bufB
  }

  /** Starts (or resumes) playback from the current pause offset. */
  async play(deck: Deck): Promise<void> {
    const state = this.getState(deck)
    if (!state?.buffer || state.isPlaying) return

    // Resuming the context handles browser autoplay suspension
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()

    const source = this.ctx!.createBufferSource()
    source.buffer = state.buffer

    // BufferSource → lowFilter → midFilter → hiFilter → gainNode → destination
    source.connect(state.lowFilter)

    source.onended = () => {
      if (state.source === source) {
        state.source      = null
        state.isPlaying   = false
        state.pauseOffset = 0  // natural end — replay from start next time
      }
    }

    state.source    = source
    state.startTime = this.ctx!.currentTime
    state.isPlaying = true
    source.start(0, state.pauseOffset)
  }

  /** Freezes playback and preserves position for resume. */
  pause(deck: Deck): void {
    const state = this.getState(deck)
    if (!state?.isPlaying || !state.source) return

    state.pauseOffset += this.ctx!.currentTime - state.startTime
    state.source.onended = null  // prevent the onended handler from firing on stop()
    state.source.stop()
    state.source    = null
    state.isPlaying = false
  }

  /** Sets channel volume. value: 0–1. */
  setGain(deck: Deck, value: number): void {
    const state = this.getState(deck)
    if (!state) return
    state.gainNode.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.01)
  }

  /**
   * Adjusts an EQ band. value: 0–1, where 0.5 = 0 dB (flat).
   *   low  → lowshelf  at 200 Hz,  ±12 dB
   *   mid  → peaking   at 1000 Hz, ±12 dB
   *   hi   → highshelf at 3200 Hz, ±12 dB
   */
  setEQ(deck: Deck, band: EQBand, value: number): void {
    const state = this.getState(deck)
    if (!state) return
    const gainDb = (value - 0.5) * (EQ_GAIN_RANGE_DB * 2)
    const filter = band === 'low' ? state.lowFilter
                 : band === 'mid' ? state.midFilter
                 : state.hiFilter
    filter.gain.setTargetAtTime(gainDb, this.ctx!.currentTime, 0.01)
  }

  destroy(): void {
    void this.ctx?.close()
    this.ctx  = null
    this.decks = null
  }

  // ── private ──────────────────────────────────────────────────────────────

  private createDeckNodes(): DeckState {
    const ctx = this.ctx!

    const gainNode  = ctx.createGain()
    const lowFilter = ctx.createBiquadFilter()
    const midFilter = ctx.createBiquadFilter()
    const hiFilter  = ctx.createBiquadFilter()

    lowFilter.type           = 'lowshelf'
    lowFilter.frequency.value = 200
    lowFilter.gain.value      = 0

    midFilter.type           = 'peaking'
    midFilter.frequency.value = 1000
    midFilter.Q.value         = 1.0  // controls peak bandwidth
    midFilter.gain.value      = 0

    hiFilter.type            = 'highshelf'
    hiFilter.frequency.value  = 3200
    hiFilter.gain.value       = 0

    // Static chain (source nodes attach to lowFilter per play() call)
    lowFilter.connect(midFilter)
    midFilter.connect(hiFilter)
    hiFilter.connect(gainNode)
    gainNode.connect(ctx.destination)

    return {
      buffer:      null,
      source:      null,
      gainNode,
      lowFilter,
      midFilter,
      hiFilter,
      isPlaying:   false,
      pauseOffset: 0,
      startTime:   0,
    }
  }

  private async loadBuffer(path: string): Promise<AudioBuffer> {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`AudioEngine: fetch failed for "${path}" (${response.status})`)
    const arrayBuffer = await response.arrayBuffer()
    return this.ctx!.decodeAudioData(arrayBuffer)
  }

  private getState(deck: Deck): DeckState | null {
    return this.decks?.[deck] ?? null
  }
}

export const audioEngine = new AudioEngine()
