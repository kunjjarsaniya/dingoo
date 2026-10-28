import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { Server } from 'socket.io'
import { config } from './config'
import { registerSocketHandlers } from './socket'

export function createBingoServer() {
  const log = pino({ level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info') })
  const allowedOrigins = config.ALLOWED_ORIGINS === '*' ? '*' : config.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  const app = express()
  app.use(cors({ origin: allowedOrigins, credentials: true }))
  app.use(express.json({ limit: '16kb' }))
  if (process.env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger: log }))
  }
  app.get('/health', (_req, res) =>
    res.json({ success: true, data: { status: 'ok' }, error: null, requestId: _req.id })
  )

  const server = http.createServer(app)
  const io = new Server(server, {
    cors: { origin: '*', credentials: true },
    pingTimeout: 20000,
  })

  registerSocketHandlers(io, log)
  return { app, server, io, log }
}

if (process.env.NODE_ENV !== 'test') {
  const { server, log } = createBingoServer()
  server.listen(config.PORT, () => log.info({ port: config.PORT }, 'bingo server listening'))
}
