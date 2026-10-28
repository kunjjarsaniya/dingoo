import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:4000'
    }
    // If running on Vercel or custom domain without NEXT_PUBLIC_SOCKET_URL,
    // check if window._DINGOO_SOCKET_URL was injected or default to Render/Railway standard backend
    const customUrl = (window as any).__DINGOO_SOCKET_URL
    if (customUrl) return customUrl
  }
  return 'http://localhost:4000'
}

export function getSocket(): Socket {
  if (!socket) {
    const socketUrl = getSocketUrl()

    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
  }
  return socket
}
