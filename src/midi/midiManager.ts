export type Deck = 'A' | 'B'

export interface MidiManagerEvents {
  play:         (deck: Deck) => void
  cue:          (deck: Deck) => void
  eqHi:         (deck: Deck, value: number) => void
  eqMid:        (deck: Deck, value: number) => void
  eqLow:        (deck: Deck, value: number) => void
  channelFader: (deck: Deck, value: number) => void
  crossfader:   (value: number) => void
}

type FaderEvent = Extract<keyof MidiManagerEvents, 'eqHi' | 'eqMid' | 'eqLow' | 'channelFader' | 'crossfader'>

type ListenerMap = { [K in keyof MidiManagerEvents]: Set<MidiManagerEvents[K]> }

// MIDI channel index (0-based) → Deck
const DECK_BY_CHANNEL: Readonly<Record<number, Deck>> = { 0: 'A', 1: 'B' }
const CROSSFADER_CHANNEL = 6 // MIDI channel 7

const NOTE_PLAY = 11
const NOTE_CUE  = 12

// MSB CC number → event name (LSB = MSB + 32 per MIDI spec)
const MSB_CC_EVENT: Readonly<Partial<Record<number, FaderEvent>>> = {
  7:  'eqHi',
  11: 'eqMid',
  15: 'eqLow',
  19: 'channelFader',
  31: 'crossfader',
}

const FOURTEEN_BIT_MAX = 16383 // 2^14 - 1

class MidiManager {
  private readonly listeners: ListenerMap = {
    play:         new Set(),
    cue:          new Set(),
    eqHi:         new Set(),
    eqMid:        new Set(),
    eqLow:        new Set(),
    channelFader: new Set(),
    crossfader:   new Set(),
  }

  // Buffers MSB until its paired LSB arrives; key = "<channel>:<msbCC>"
  private readonly msbBuffer = new Map<string, number>()

  private access: MIDIAccess | null = null

  async init(): Promise<void> {
    this.access = await navigator.requestMIDIAccess()
    this.bindInputs()
    this.access.onstatechange = () => this.bindInputs()
  }

  on<K extends keyof MidiManagerEvents>(event: K, cb: MidiManagerEvents[K]): void {
    this.listeners[event].add(cb)
  }

  off<K extends keyof MidiManagerEvents>(event: K, cb: MidiManagerEvents[K]): void {
    this.listeners[event].delete(cb)
  }

  destroy(): void {
    if (!this.access) return
    for (const input of this.access.inputs.values()) input.onmidimessage = null
    this.access.onstatechange = null
    this.access = null
  }

  // ── private ──────────────────────────────────────────────────────────────

  private bindInputs(): void {
    if (!this.access) return
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (e) => this.handleMessage(e)
    }
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const { data } = event
    if (!data || data.length < 2) return

    const status  = data[0]
    const data1   = data[1]
    const data2   = data[2] ?? 0
    const msgType = status & 0xf0
    const channel = status & 0x0f

    if (msgType === 0x90 && data2 > 0) this.handleNote(channel, data1)
    else if (msgType === 0xb0)         this.handleCC(channel, data1, data2)
  }

  private handleNote(channel: number, note: number): void {
    const deck = DECK_BY_CHANNEL[channel]
    if (!deck) return
    if (note === NOTE_PLAY) this.emit('play', deck)
    else if (note === NOTE_CUE) this.emit('cue', deck)
  }

  private handleCC(channel: number, cc: number, value: number): void {
    if (cc >= 32) {
      // LSB arrived — resolve the 14-bit pair
      const msbCC    = cc - 32
      const eventName = MSB_CC_EVENT[msbCC]
      if (!eventName) return

      const bufKey   = `${channel}:${msbCC}`
      const msb      = this.msbBuffer.get(bufKey) ?? 0
      this.msbBuffer.delete(bufKey)

      const normalized = ((msb << 7) | value) / FOURTEEN_BIT_MAX
      this.dispatchFader(eventName, channel, normalized)
    } else {
      // MSB arrived — park it until LSB completes the pair
      if (!MSB_CC_EVENT[cc]) return
      this.msbBuffer.set(`${channel}:${cc}`, value)
    }
  }

  private dispatchFader(event: FaderEvent, channel: number, value: number): void {
    if (event === 'crossfader') {
      if (channel === CROSSFADER_CHANNEL) this.emit('crossfader', value)
    } else {
      const deck = DECK_BY_CHANNEL[channel]
      if (deck) this.emit(event, deck, value)
    }
  }

  private emit<K extends keyof MidiManagerEvents>(
    event: K,
    ...args: Parameters<MidiManagerEvents[K]>
  ): void {
    for (const cb of this.listeners[event]) {
      (cb as (...a: Parameters<MidiManagerEvents[K]>) => void)(...args)
    }
  }
}

export const midiManager = new MidiManager()
