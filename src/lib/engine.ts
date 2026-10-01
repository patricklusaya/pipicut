import { clock } from './clock.ts'

type FrameHandler = (time: number, playing: boolean) => void
type Listener = () => void

class PlaybackEngine {
  private audio: HTMLAudioElement | null = null
  private audioUrl: string | null = null
  private audioDuration = 0
  private duration = 0
  private playing = false
  private voiceVolume = 1
  private raf = 0
  private fallbackTime = 0
  private fallbackPerf = 0
  private usingFallback = false
  private frame: FrameHandler | null = null
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  getPlaying(): boolean {
    return this.playing
  }

  getDuration(): number {
    return this.duration
  }

  setFrameHandler(handler: FrameHandler | null): void {
    this.frame = handler
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = volume
    if (this.audio) this.audio.volume = volume
  }

  setDuration(duration: number): void {
    this.duration = Math.max(0, duration)
    if (clock.time > this.duration) this.seek(this.duration)
    this.emit()
  }

  setAudio(url: string | null, mediaDuration: number): void {
    if (url === this.audioUrl) {
      this.audioDuration = mediaDuration
      return
    }
    this.stop()
    this.audio?.pause()
    this.audio = null
    this.audioUrl = url
    this.audioDuration = mediaDuration
    if (url) {
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = url
      audio.volume = this.voiceVolume
      this.audio = audio
    }
    this.seek(0)
    this.emit()
  }

  play(): void {
    if (this.duration <= 0) return
    if (clock.time >= this.duration - 0.02) this.seek(0)
    this.playing = true
    this.armClock(clock.time)
    this.syncAudio(clock.time, true)
    this.frame?.(clock.time, true)
    this.emit()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
  }

  pause(): void {
    if (!this.playing && !this.raf) return
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.audio?.pause()
    this.frame?.(clock.time, false)
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(time: number): void {
    const next = Math.min(Math.max(0, time), this.duration || 0)
    this.armClock(next)
    clock.setTime(next)
    this.syncAudio(next, this.playing)
    this.frame?.(next, this.playing)
  }

  stop(): void {
    this.pause()
    this.seek(0)
  }

  private armClock(time: number): void {
    this.fallbackTime = time
    this.fallbackPerf = performance.now()
    this.usingFallback = !this.audio || time >= this.audioDuration - 0.05
  }

  private syncAudio(time: number, shouldPlay: boolean): void {
    const audio = this.audio
    if (!audio) return
    if (time >= this.audioDuration - 0.02) {
      if (!audio.paused) audio.pause()
      this.usingFallback = true
      return
    }
    if (Math.abs(audio.currentTime - time) > 0.12) audio.currentTime = time
    audio.volume = this.voiceVolume
    if (shouldPlay && audio.paused) {
      void audio.play().catch(() => {
        this.usingFallback = true
      })
    }
    if (!shouldPlay && !audio.paused) audio.pause()
  }

  private loop = (): void => {
    if (!this.playing) return
    let time: number
    const audio = this.audio
    if (audio && !this.usingFallback && clock.time < this.audioDuration - 0.05 && !audio.paused) {
      time = audio.currentTime
      this.fallbackTime = time
      this.fallbackPerf = performance.now()
    } else {
      time = this.fallbackTime + (performance.now() - this.fallbackPerf) / 1000
      this.fallbackTime = time
      this.fallbackPerf = performance.now()
      if (audio && time < this.audioDuration - 0.05) this.syncAudio(time, true)
      else this.usingFallback = true
    }
    if (time >= this.duration) {
      clock.setTime(this.duration)
      this.frame?.(this.duration, false)
      this.playing = false
      cancelAnimationFrame(this.raf)
      this.raf = 0
      audio?.pause()
      this.emit()
      return
    }
    clock.setTime(time)
    this.frame?.(time, true)
    this.raf = requestAnimationFrame(this.loop)
  }
}

export const engine = new PlaybackEngine()
