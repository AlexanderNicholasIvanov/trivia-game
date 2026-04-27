/**
 * Audio engine for the bar room music and game SFX.
 *
 * Music: a small playlist of CC0 public-domain piano jazz from the
 * Internet Archive (1927-1946 78rpm transfers). Plays through a plain
 * HTMLAudioElement so it doesn't depend on the AudioContext being
 * resumed in the same tick as the user gesture — this is the most
 * autoplay-resilient pattern.
 *
 * SFX (lock, correct, wrong, tick) are synthesised with the Web Audio
 * API and routed through a dedicated bus so they stay punchy when the
 * music ducks during a round.
 */

const MUTE_KEY = 'theregulars-club:muted'

const MUSIC_VOLUME = 0.55 // base HTMLAudio volume when fully un-ducked
const SFX_GAIN = 0.55

const MUSIC_TRACKS = [
  '/audio/sunny-morning.mp3', // Teddy Wilson, 1946 — solo piano
  '/audio/geechee.mp3', // Fats Waller, 1927 — sparse piano + organ
  '/audio/alone-in-the-rain.mp3', // Coon-Sanders Nighthawks, 1929 — slow group
]

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

function shuffled<T>(input: readonly T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

class AudioEngine {
  // SFX uses Web Audio (synthesis); music uses plain HTMLAudio.
  private ctx: AudioContext | null = null
  private sfxBus: GainNode | null = null

  private musicEl: HTMLAudioElement | null = null
  private musicStarted = false
  private playOrder: string[] = []
  private playIndex = 0

  private muted = readMutePref()
  private duckLevel = 1
  private subscribers = new Set<() => void>()

  private clinkTimer: ReturnType<typeof setTimeout> | null = null
  private rampTimer: ReturnType<typeof setInterval> | null = null

  /** Lazily create the AudioContext for SFX. */
  private ensureSfx(): AudioContext | null {
    if (this.ctx) return this.ctx
    if (typeof window === 'undefined') return null
    const w = window as WindowWithWebkit
    const Ctor = window.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
    const sfx = ctx.createGain()
    sfx.gain.value = this.muted ? 0 : SFX_GAIN
    sfx.connect(ctx.destination)
    this.ctx = ctx
    this.sfxBus = sfx
    return ctx
  }

  /**
   * Resume the audio context and start the music playlist. Safe to call
   * repeatedly — does work only on the first call. Must be invoked from
   * a user gesture for autoplay-locked browsers.
   */
  unlock(): void {
    const ctx = this.ensureSfx()
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        /* best effort */
      })
    }
    if (!this.musicStarted) {
      this.startMusic()
      this.scheduleClink()
      this.musicStarted = true
    } else if (this.musicEl && this.musicEl.paused) {
      // Some browsers occasionally drop playback (tab backgrounded etc.).
      // Re-attempt on subsequent gestures.
      void this.musicEl.play().catch(() => {
        /* still locked — try again next gesture */
      })
    }
  }

  /** True once the music element is actually playing (not paused). */
  isPlayingMusic(): boolean {
    const el = this.musicEl
    return !!el && !el.paused && !el.ended
  }

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    writeMutePref(muted)
    this.applyMusicVolume(true)
    const ctx = this.ctx
    const bus = this.sfxBus
    if (ctx && bus) {
      const now = ctx.currentTime
      bus.gain.cancelScheduledValues(now)
      bus.gain.linearRampToValueAtTime(muted ? 0 : SFX_GAIN, now + 0.25)
    }
    this.notify()
  }

  /** Duck the music by a factor in [0, 1]. SFX bus is unaffected. */
  setDuck(level: number): void {
    this.duckLevel = Math.max(0, Math.min(1, level))
    this.applyMusicVolume(false)
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  // -- music ----------------------------------------------------------------

  private startMusic(): void {
    const el = new Audio()
    el.preload = 'auto'
    el.volume = this.muted ? 0 : MUSIC_VOLUME * this.duckLevel
    el.addEventListener('ended', () => this.advanceTrack())
    el.addEventListener('error', () => this.advanceTrack())
    this.musicEl = el
    this.playOrder = shuffled(MUSIC_TRACKS)
    this.playIndex = 0
    this.advanceTrack()
  }

  private advanceTrack(): void {
    const el = this.musicEl
    if (!el) return
    const src = this.playOrder[this.playIndex % this.playOrder.length]
    this.playIndex += 1
    el.src = src
    void el.play().catch(() => {
      // Autoplay still locked — caller will retry on next gesture.
    })
  }

  private applyMusicVolume(instant: boolean): void {
    const el = this.musicEl
    if (!el) return
    const target = this.muted ? 0 : MUSIC_VOLUME * this.duckLevel
    if (instant) {
      el.volume = target
      return
    }
    if (this.rampTimer !== null) {
      clearInterval(this.rampTimer)
      this.rampTimer = null
    }
    const startVol = el.volume
    const startTime = Date.now()
    const durationMs = 400
    if (Math.abs(startVol - target) < 0.005) {
      el.volume = target
      return
    }
    this.rampTimer = setInterval(() => {
      if (!this.musicEl) return
      const t = Math.min(1, (Date.now() - startTime) / durationMs)
      this.musicEl.volume = startVol + (target - startVol) * t
      if (t >= 1) {
        if (this.rampTimer !== null) {
          clearInterval(this.rampTimer)
          this.rampTimer = null
        }
      }
    }, 16)
  }

  // -- room events ----------------------------------------------------------

  private scheduleClink(): void {
    const delayMs = 20000 + Math.random() * 30000
    this.clinkTimer = setTimeout(() => {
      this.emitClink()
      this.scheduleClink()
    }, delayMs)
  }

  private emitClink(): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus || this.muted) return
    const now = ctx.currentTime
    const baseFreq = 900 + Math.random() * 700
    for (const detune of [0, 8.4]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = baseFreq * (1 + detune / 1200)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(0.025, now + 0.005)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.42)
      osc.connect(env).connect(bus)
      osc.start(now)
      osc.stop(now + 0.5)
    }
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
    const bus = this.sfxBus
    if (!ctx || !bus || this.muted) return
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
      osc.connect(env).connect(bus)
      osc.start(start)
      osc.stop(start + 0.5)
    })
  }

  /** Dissonant pink buzz — falling pitch with beating. */
  wrong(): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus || this.muted) return
    const now = ctx.currentTime
    const baseFreqs = [220, 233.08]
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
      osc.connect(filter).connect(env).connect(bus)
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

  /** Stop everything (used in tests / hot reload). */
  dispose(): void {
    if (this.clinkTimer) clearTimeout(this.clinkTimer)
    if (this.rampTimer) clearInterval(this.rampTimer)
    this.musicEl?.pause()
    this.musicEl = null
    this.ctx?.close().catch(() => {
      /* noop */
    })
    this.ctx = null
    this.sfxBus = null
    this.musicStarted = false
  }
}

export const audio = new AudioEngine()
