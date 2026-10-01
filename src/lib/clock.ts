type Listener = (time: number) => void

class Clock {
  time = 0
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setTime(time: number): void {
    this.time = time
    for (const listener of this.listeners) listener(time)
  }
}

export const clock = new Clock()
