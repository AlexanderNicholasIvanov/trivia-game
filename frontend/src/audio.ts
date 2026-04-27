/**
 * Procedural audio engine.
 *
 * Everything is synthesised with the Web Audio API — no asset downloads,
 * no licensing, and the ambience never repeats exactly. Layers:
 *
 *   - pub murmur: pink noise through a low-pass with a slow LFO on cutoff
 *   - tape hiss: white noise through a high-pass at very low gain
 *   - room events: occasional glass clink (sine ping) and tape crackle pop
 *
 * Plus four SFX (lock, correct, wrong, tick) routed through a separate bus
 * so they ride above the ambience without ducking it themselves.
 */

const MUTE_KEY = 'theregulars-club:muted'

const AMBIENCE_BASE_GAIN = 0.18 // master ambience level when fully un-ducked
const SFX_GAIN = 0.55

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext
}

function readMutePref(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMutePref(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function createNoiseBuffer(
  ctx: AudioContext,
  durationSeconds: number,
  type: 'white' | 'pink',
): AudioBuffer {
  const size = Math.floor(ctx.sampleRate * durationSeconds)
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  if (type === 'white') {
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1
    }
  } else {
    // Voss-McCartney pink noise approximation.
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < size; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  }
  return buffer
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambienceBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private ambienceStarted = false
  private muted = readMutePref()
  private subscribers = new Set<() => void>()
  private clinkTimer: ReturnType<typeof setTimeout> | null = null
  private crackleTimer: ReturnType<typeof setTimeout> | null = null

  /** Lazily create the AudioContext. Called on first user gesture. */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    if (typeof window === 'undefined') return null
    const w = window as WindowWithWebkit
    const Ctor = window.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()

    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 1
    master.connect(ctx.destination)

    const ambience = ctx.createGain()
    ambience.gain.value = AMBIENCE_BASE_GAIN
    ambience.connect(master)

    const sfx = ctx.createGain()
    sfx.gain.value = SFX_GAIN
    sfx.connect(master)

    this.ctx = ctx
    this.master = master
    this.ambienceBus = ambience
    this.sfxBus = sfx
    return ctx
  }

  /**
   * Resume the audio context (must be called from a user gesture in
   * Chrome/Safari) and start the ambience layers if not already running.
   */
  unlock(): void {
    const ctx = this.ensure()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        /* ignore — best effort */
      })
    }
    if (!this.ambienceStarted) {
      this.startAmbience()
      this.ambienceStarted = true
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    writeMutePref(muted)
    const ctx = this.ctx
    const master = this.master
    if (ctx && master) {
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.25)
    }
    this.notify()
  }

  /**
   * Duck the ambience by a factor in [0, 1]. 1 = full ambience, 0 = silent.
   * SFX bus is unaffected, so reveals/ticks stay punchy under the duck.
   */
  setDuck(level: number): void {
    const clamped = Math.max(0, Math.min(1, level))
    const ctx = this.ctx
    const bus = this.ambienceBus
    if (!ctx || !bus) return
    const now = ctx.currentTime
    bus.gain.cancelScheduledValues(now)
    bus.gain.linearRampToValueAtTime(AMBIENCE_BASE_GAIN * clamped, now + 0.4)
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  // -- ambience layers ------------------------------------------------------

  private startAmbience(): void {
    const ctx = this.ctx
    const bus = this.ambienceBus
    if (!ctx || !bus) return

    // Pub murmur: pink noise through a wandering low-pass.
    const pinkBuffer = createNoiseBuffer(ctx, 12, 'pink')
    const pinkSrc = ctx.createBufferSource()
    pinkSrc.buffer = pinkBuffer
    pinkSrc.loop = true
    const murmurFilter = ctx.createBiquadFilter()
    murmurFilter.type = 'lowpass'
    murmurFilter.frequency.value = 600
    murmurFilter.Q.value = 0.6
    const murmurGain = ctx.createGain()
    murmurGain.gain.value = 0.55
    pinkSrc.connect(murmurFilter).connect(murmurGain).connect(bus)
    pinkSrc.start()

    // Slow LFO on the filter cutoff so the murmur breathes.
    const lfoBuffer = createNoiseBuffer(ctx, 30, 'pink')
    const lfo = ctx.createBufferSource()
    lfo.buffer = lfoBuffer
    lfo.loop = true
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 250
    lfo.connect(lfoGain).connect(murmurFilter.frequency)
    lfo.start()

    // Tape hiss: white noise through a high-pass.
    const whiteBuffer = createNoiseBuffer(ctx, 4, 'white')
    const whiteSrc = ctx.createBufferSource()
    whiteSrc.buffer = whiteBuffer
    whiteSrc.loop = true
    const hissFilter = ctx.createBiquadFilter()
    hissFilter.type = 'highpass'
    hissFilter.frequency.value = 4500
    const hissGain = ctx.createGain()
    hissGain.gain.value = 0.12
    whiteSrc.connect(hissFilter).connect(hissGain).connect(bus)
    whiteSrc.start()

    this.scheduleClink()
    this.scheduleCrackle()
  }

  private scheduleClink(): void {
    const delayMs = 8000 + Math.random() * 14000
    this.clinkTimer = setTimeout(() => {
      this.emitClink()
      this.scheduleClink()
    }, delayMs)
  }

  private scheduleCrackle(): void {
    const delayMs = 1500 + Math.random() * 4000
    this.crackleTimer = setTimeout(() => {
      this.emitCrackle()
      this.scheduleCrackle()
    }, delayMs)
  }

  private emitClink(): void {
    const ctx = this.ctx
    const bus = this.ambienceBus
    if (!ctx || !bus) return
    const now = ctx.currentTime
    // Two stacked sines — fundamental + slight detune for that real-glass shimmer.
    const baseFreq = 900 + Math.random() * 700
    for (const detune of [0, 8.4]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = baseFreq * (1 + detune / 1200)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(0.04, now + 0.005)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.42)
      osc.connect(env).connect(bus)
      osc.start(now)
      osc.stop(now + 0.5)
    }
  }

  private emitCrackle(): void {
    const ctx = this.ctx
    const bus = this.ambienceBus
    if (!ctx || !bus) return
    const now = ctx.currentTime
    const dur = 0.04
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3))
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1800
    const gain = ctx.createGain()
    gain.gain.value = 0.06 + Math.random() * 0.05
    src.connect(filter).connect(gain).connect(bus)
    src.start(now)
  }

  // -- SFX ------------------------------------------------------------------

  private playEnvelope(
    osc: OscillatorNode,
    duration: number,
    peakGain: number,
    attack = 0.005,
  ): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus) return
    const now = ctx.currentTime
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, now)
    env.gain.linearRampToValueAtTime(peakGain, now + attack)
    env.gain.exponentialRampToValueAtTime(0.001, now + duration)
    osc.connect(env).connect(bus)
    osc.start(now)
    osc.stop(now + duration + 0.05)
  }

  /** Short filtered click for "answer locked in". */
  lock(): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus || this.muted) return
    const now = ctx.currentTime
    const buffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 0.08),
      ctx.sampleRate,
    )
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25))
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1500
    const gain = ctx.createGain()
    gain.gain.value = 0.45
    src.connect(filter).connect(gain).connect(bus)
    src.start(now)
  }

  /** Two-tone amber chime — rising. */
  correct(): void {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const notes = [659.25, 987.77] // E5, B5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.12
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(0.32, start + 0.01)
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.45)
      osc.connect(env).connect(this.sfxBus!)
      osc.start(start)
      osc.stop(start + 0.5)
    })
  }

  /** Dissonant pink buzz — falling pitch with beating. */
  wrong(): void {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const now = ctx.currentTime
    const baseFreqs = [220, 233.08] // whole step apart → beating
    baseFreqs.forEach((freq) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.linearRampToValueAtTime(freq * 0.6, now + 0.45)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(0.18, now + 0.01)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
      osc.connect(filter).connect(env).connect(this.sfxBus!)
      osc.start(now)
      osc.stop(now + 0.55)
    })
  }

  /** Tiny woodblock-y tick for the last few seconds of a round. */
  tick(): void {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 1500
    this.playEnvelope(osc, 0.08, 0.18, 0.002)
  }

  // -- internals ------------------------------------------------------------

  private notify(): void {
    this.subscribers.forEach((fn) => fn())
  }

  /** Stop the ambience entirely (used in tests / hot reload). */
  dispose(): void {
    if (this.clinkTimer) clearTimeout(this.clinkTimer)
    if (this.crackleTimer) clearTimeout(this.crackleTimer)
    this.ctx?.close().catch(() => {
      /* noop */
    })
    this.ctx = null
    this.master = null
    this.ambienceBus = null
    this.sfxBus = null
    this.ambienceStarted = false
  }
}

export const audio = new AudioEngine()
