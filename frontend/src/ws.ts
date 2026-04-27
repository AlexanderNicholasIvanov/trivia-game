import type { ServerMessage } from './types'

function getBaseWsUrl(): string {
  const override = import.meta.env.VITE_WS_BASE_URL
  if (override) return override
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}`
  }
  return 'ws://localhost:8000'
}

export type MessageHandler = (message: ServerMessage) => void
export type CloseHandler = (event: CloseEvent) => void

export class TriviaSocket {
  private socket: WebSocket | null = null
  private handlers: MessageHandler[] = []
  private closeHandlers: CloseHandler[] = []
  private path: string
  private manualClose = false

  constructor(path: string) {
    this.path = path
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${getBaseWsUrl()}${this.path}`
      this.socket = new WebSocket(url)

      this.socket.onopen = () => resolve()
      this.socket.onerror = (err) => reject(err)
      this.socket.onclose = (event) => {
        if (this.manualClose) return
        this.closeHandlers.forEach((h) => h(event))
      }
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

  onClose(handler: CloseHandler): () => void {
    this.closeHandlers.push(handler)
    return () => {
      this.closeHandlers = this.closeHandlers.filter((h) => h !== handler)
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
    this.manualClose = true
    this.socket?.close()
    this.socket = null
    this.handlers = []
    this.closeHandlers = []
  }
}
