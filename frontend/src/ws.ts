import type { ServerMessage } from './types'

const BASE_WS_URL =
  import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000'

export type MessageHandler = (message: ServerMessage) => void

export class TriviaSocket {
  private socket: WebSocket | null = null
  private handlers: MessageHandler[] = []
  private path: string

  constructor(path: string) {
    this.path = path
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${BASE_WS_URL}${this.path}`
      this.socket = new WebSocket(url)

      this.socket.onopen = () => resolve()
      this.socket.onerror = (err) => reject(err)
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage
          this.handlers.forEach((h) => h(data))
        } catch (err) {
          console.error('Invalid WS message:', event.data, err)
        }
      }
    })
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  send(payload: object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Socket not open, dropping message:', payload)
      return
    }
    this.socket.send(JSON.stringify(payload))
  }

  close(): void {
    this.socket?.close()
    this.socket = null
    this.handlers = []
  }
}
