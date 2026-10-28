import type { Server, Socket } from 'socket.io'
import type { Logger } from 'pino'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from './db'
import {
  generateCard,
  roomCode,
  token,
  validateArrangement,
  completedLines,
  hasWon,
  type Card,
  type WinningCondition,
} from './domain/bingo'
import { config } from './config'

const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const ok = (requestId: string, data: unknown) => ({ success: true, data, error: null, requestId })
const fail = (requestId: string, code: string, message: string, details?: unknown) => ({
  success: false,
  data: details ?? null,
  error: { code, message },
  requestId,
})

// Validation schemas
const createRoomSchema = z.object({
  name: z.string().trim().min(1, 'Display name is required').max(32, 'Display name too long'),
  cardSize: z.coerce.number().int().min(5, 'Minimum card size is 5 (5x5)').max(10, 'Maximum card size is 10 (10x10)').default(5),
  rangeMin: z.coerce.number().int().default(1),
  rangeMax: z.coerce.number().int().optional(),
  minPlayers: z.coerce.number().int().min(1).max(20).default(2),
  maxPlayers: z.coerce.number().int().min(2).max(20).default(10),
  countdownSeconds: z.coerce.number().int().min(1).max(60).default(5),
  winningCondition: z.enum(['FIRST_LINE', 'FIVE_LINES', 'FULL_CARD']).default('FIVE_LINES'),
})

const joinRoomSchema = z.object({
  code: z.string().trim().min(1, 'Room code is required'),
  name: z.string().trim().min(1, 'Display name is required').max(32, 'Display name too long'),
})

const reconnectSchema = z.object({
  playerId: z.string().min(1, 'Player ID is required'),
  reconnectToken: z.string().min(1, 'Reconnect token is required'),
})

const rearrangeSchema = z.object({
  values: z.array(z.number().int()),
})

const readySchema = z.object({
  ready: z.boolean(),
})

const selectNumberSchema = z.object({
  number: z.number().int(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
})

// In-memory active countdown timers and turn timers per room
const activeCountdowns = new Map<string, NodeJS.Timeout>()
const activeTurnTimers = new Map<string, { interval: NodeJS.Timeout; remaining: number }>()
const roomCache = new Map<string, any>()
const TURN_TIMEOUT_SECONDS = 40

async function getFullRoomState(roomId: string, forceDb = false) {
  if (!forceDb && roomCache.has(roomId)) {
    return roomCache.get(roomId)
  }
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: {
        orderBy: { position: 'asc' },
        include: {
          card: true,
          awardedLines: true,
        },
      },
      selections: {
        orderBy: { turnNumber: 'asc' },
      },
      results: {
        orderBy: { rank: 'asc' },
      },
    },
  })
  if (room) {
    roomCache.set(roomId, room)
  }
  return room
}

async function persistGameSelection(
  roomId: string,
  playerId: string,
  number: number,
  idempotencyKey: string,
  turnNumber: number,
  isFinished: boolean,
  winners: any[],
  playersToDbUpdate: any[],
  nextPlayerId: string | null,
  allPlayers: any[]
) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Record selection
      await tx.numberSelection.create({
        data: {
          roomId,
          playerId,
          number,
          turnNumber,
          idempotencyKey,
        },
      })

      // 2. Update players cards, scores & awarded lines
      for (const p of playersToDbUpdate) {
        await tx.bingoCard.update({
          where: { playerId: p.playerId },
          data: { marked: p.cardMarked },
        })

        if (p.newLines && p.newLines.length > 0) {
          for (const lineIdx of p.newLines) {
            await tx.completedLine.create({
              data: {
                playerId: p.playerId,
                lineIndex: lineIdx,
              },
            })
          }
        }

        await tx.player.update({
          where: { id: p.playerId },
          data: {
            score: p.score,
            completedLines: p.completedLines,
          },
        })
      }

      // 3. Update room state
      if (isFinished) {
        await tx.room.update({
          where: { id: roomId },
          data: {
            state: 'FINISHED',
            endedAt: new Date(),
            turnNumber: { increment: 1 },
            gameStateVersion: { increment: 1 },
          },
        })

        const winnerIds = new Set(winners.map((w) => w.playerId))
        const rankedPlayers = [...allPlayers].sort((a, b) => {
          if (winnerIds.has(a.id) && !winnerIds.has(b.id)) return -1
          if (!winnerIds.has(a.id) && winnerIds.has(b.id)) return 1
          return (b.score || 0) - (a.score || 0) || a.position - b.position
        })

        for (let rank = 0; rank < rankedPlayers.length; rank++) {
          const p = rankedPlayers[rank]
          await tx.gameResult.create({
            data: {
              roomId,
              playerId: p.id,
              rank: rank + 1,
              winner: winnerIds.has(p.id),
              score: p.score,
              completedLines: p.completedLines,
            },
          })
        }
      } else if (nextPlayerId) {
        await tx.room.update({
          where: { id: roomId },
          data: {
            turnNumber: { increment: 1 },
            gameStateVersion: { increment: 1 },
            currentPlayerId: nextPlayerId,
          },
        })
      }
    })
  } catch (err: any) {
    if (err?.code !== 'P2002') {
      console.error('Background persistence error:', err)
    }
  }
}

export function registerSocketHandlers(io: Server, log: Logger) {
  function clearTurnTimer(roomId: string) {
    const existing = activeTurnTimers.get(roomId)
    if (existing) {
      clearInterval(existing.interval)
      activeTurnTimers.delete(roomId)
    }
  }

  function startTurnTimer(roomId: string) {
    clearTurnTimer(roomId)

    let remaining = TURN_TIMEOUT_SECONDS
    io.to(roomId).emit('turn:tick', ok('server', { roomId, remaining, timeLimit: TURN_TIMEOUT_SECONDS }))

    const interval = setInterval(async () => {
      remaining -= 1
      if (remaining > 0) {
        io.to(roomId).emit('turn:tick', ok('server', { roomId, remaining, timeLimit: TURN_TIMEOUT_SECONDS }))
      } else {
        clearTurnTimer(roomId)
        await handleTurnTimeout(roomId)
      }
    }, 1000)

    activeTurnTimers.set(roomId, { interval, remaining })
  }

  async function handleTurnTimeout(roomId: string) {
    try {
      const room = await getFullRoomState(roomId)
      if (!room || room.state !== 'PLAYING') return

      const timedOutPlayerId = room.currentPlayerId
      const activePlayers = (room.players || []).filter((p: any) => p.connected)
      if (activePlayers.length === 0) return

      const currentIdx = activePlayers.findIndex((p: any) => p.id === timedOutPlayerId)
      const nextPlayer = activePlayers[(currentIdx + 1) % activePlayers.length] || activePlayers[0]

      room.turnNumber += 1
      room.gameStateVersion = (room.gameStateVersion || 0) + 1
      room.currentPlayerId = nextPlayer.id
      roomCache.set(roomId, room)

      log.info({ roomId, timedOutPlayerId, nextPlayerId: nextPlayer.id }, 'Turn timed out after 40s')

      io.to(roomId).emit('turn:timeout', ok('server', {
        roomId,
        timedOutPlayerId,
        nextPlayerId: nextPlayer.id,
        turnNumber: room.turnNumber,
      }))
      io.to(roomId).emit('room:state', ok('server', room))

      // Start 40s timer for the next player!
      startTurnTimer(roomId)

      // Background persist to database
      prisma.room.update({
        where: { id: roomId },
        data: {
          turnNumber: { increment: 1 },
          gameStateVersion: { increment: 1 },
          currentPlayerId: nextPlayer.id,
        },
      }).catch((err) => log.error(err, 'Failed to persist turn timeout'))
    } catch (err) {
      log.error(err, 'Error in handleTurnTimeout')
    }
  }

  async function cancelCountdown(roomId: string) {
    const timer = activeCountdowns.get(roomId)
    if (timer) {
      clearInterval(timer)
      activeCountdowns.delete(roomId)
    }
    await prisma.room.update({
      where: { id: roomId },
      data: { state: 'WAITING' },
    })
    io.to(roomId).emit('room:countdown_cancelled', ok('server', { roomId }))
    const state = await getFullRoomState(roomId, true)
    if (state) io.to(roomId).emit('room:state', ok('server', state))
  }

  function startCountdownTimer(roomId: string, seconds: number) {
    let remaining = seconds
    io.to(roomId).emit('room:countdown', ok('server', { roomId, remaining }))

    const interval = setInterval(async () => {
      remaining -= 1
      if (remaining > 0) {
        io.to(roomId).emit('room:countdown', ok('server', { roomId, remaining }))
      } else {
        clearInterval(interval)
        activeCountdowns.delete(roomId)

        try {
          const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: { players: { orderBy: { position: 'asc' } } },
          })

          if (!room || room.state !== 'COUNTDOWN') return
          const eligiblePlayers = room.players.filter((p) => p.connected)
          const allReady = eligiblePlayers.length >= room.minPlayers && eligiblePlayers.every((p) => p.ready)

          if (!allReady) {
            await prisma.room.update({ where: { id: roomId }, data: { state: 'WAITING' } })
            const state = await getFullRoomState(roomId, true)
            if (state) io.to(roomId).emit('room:state', ok('server', state))
            return
          }

          const startingPlayer = eligiblePlayers[0]
          const updated = await prisma.room.update({
            where: { id: roomId },
            data: {
              state: 'PLAYING',
              startedAt: new Date(),
              turnNumber: 1,
              gameStateVersion: 1,
              currentPlayerId: startingPlayer.id,
            },
          })

          // Update cache with fresh database state BEFORE broadcasting game:started
          const fullState = await getFullRoomState(roomId, true)
          log.info({ roomId, currentPlayerId: startingPlayer.id }, 'Game started')
          io.to(roomId).emit('game:started', ok('server', { roomId, state: updated.state, currentPlayerId: startingPlayer.id }))
          if (fullState) io.to(roomId).emit('room:state', ok('server', fullState))
          // Start the 40-second turn timer for the starting player
          startTurnTimer(roomId)
        } catch (err) {
          log.error({ err, roomId }, 'Failed to complete countdown')
        }
      }
    }, 1000)

    activeCountdowns.set(roomId, interval)
  }

  io.on('connection', (socket: Socket) => {
    socket.on('room:create', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = createRoomSchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid payload'))
        }
        const { name, cardSize, rangeMin, rangeMax, minPlayers, maxPlayers, countdownSeconds, winningCondition } = parsed.data
        const effectiveRangeMin = rangeMin ?? 1
        const effectiveRangeMax = rangeMax ?? (cardSize * cardSize)
        const code = roomCode()
        const reconnectToken = token()
        const now = new Date()

        const room = await prisma.room.create({
          data: {
            code,
            cardSize,
            rangeMin: effectiveRangeMin,
            rangeMax: effectiveRangeMax,
            minPlayers,
            maxPlayers,
            countdownSeconds,
            winningCondition,
            expiresAt: new Date(now.getTime() + config.ROOM_TTL_HOURS * 3600000),
            hostPlayerId: 'pending',
            players: {
              create: {
                name,
                position: 0,
                reconnectTokenHash: hash(reconnectToken),
                connected: true,
                card: {
                  create: {
                    ...generateCard(cardSize, effectiveRangeMin, effectiveRangeMax),
                  },
                },
              },
            },
          },
          include: {
            players: {
              include: { card: true },
            },
          },
        })

        const player = room.players[0]
        await prisma.room.update({
          where: { id: room.id },
          data: { hostPlayerId: player.id },
        })

        socket.join(room.id)
        socket.data = { roomId: room.id, playerId: player.id, reconnectToken }

        const fullRoom = await getFullRoomState(room.id)
        cb(
          ok(requestId, {
            roomId: room.id,
            code: room.code,
            playerId: player.id,
            reconnectToken,
            room: fullRoom,
            player,
          })
        )
      } catch (e) {
        log.error(e, 'Error in room:create')
        cb(fail(requestId, 'CREATE_FAILED', 'Unable to create room'))
      }
    })

    socket.on('room:join', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = joinRoomSchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid payload'))
        }
        const { code, name } = parsed.data
        const room = await prisma.room.findUnique({
          where: { code: code.toUpperCase() },
          include: {
            players: {
              include: { card: true, awardedLines: true },
            },
            selections: true,
            results: true,
          },
        })

        if (!room) return cb(fail(requestId, 'ROOM_NOT_FOUND', 'Room code is invalid'))

        // Check if player with this name already exists in the room
        const existingPlayer = room.players.find((p) => p.name.toLowerCase() === name.toLowerCase())
        if (existingPlayer) {
          if (!existingPlayer.connected) {
            // Player was disconnected - re-attach to their seat, card & game!
            const reconnectToken = token()
            await prisma.player.update({
              where: { id: existingPlayer.id },
              data: {
                connected: true,
                reconnectTokenHash: hash(reconnectToken),
              },
            })

            existingPlayer.connected = true
            socket.join(room.id)
            socket.data = { roomId: room.id, playerId: existingPlayer.id, reconnectToken }

            const fullRoom = await getFullRoomState(room.id, true)
            io.to(room.id).emit('room:state', ok(requestId, fullRoom))

            return cb(
              ok(requestId, {
                roomId: room.id,
                code: room.code,
                playerId: existingPlayer.id,
                reconnectToken,
                room: fullRoom,
                player: existingPlayer,
                reconnected: true,
              })
            )
          } else {
            return cb(fail(requestId, 'DUPLICATE_NAME', 'Choose another display name'))
          }
        }

        // New player joining
        if (room.state !== 'WAITING') return cb(fail(requestId, 'GAME_STARTED', 'This game has already started'))
        if (room.players.length >= room.maxPlayers) return cb(fail(requestId, 'ROOM_FULL', 'Room is full'))

        const reconnectToken = token()
        const player = await prisma.player.create({
          data: {
            roomId: room.id,
            name,
            position: room.players.length,
            reconnectTokenHash: hash(reconnectToken),
            connected: true,
            card: {
              create: {
                ...generateCard(room.cardSize, room.rangeMin, room.rangeMax),
              },
            },
          },
          include: { card: true },
        })

        socket.join(room.id)
        socket.data = { roomId: room.id, playerId: player.id, reconnectToken }

        const fullRoom = await getFullRoomState(room.id, true)
        io.to(room.id).emit('room:state', ok(requestId, fullRoom))

        cb(
          ok(requestId, {
            roomId: room.id,
            code: room.code,
            playerId: player.id,
            reconnectToken,
            room: fullRoom,
            player,
          })
        )
      } catch (e) {
        log.error(e, 'Error in room:join')
        cb(fail(requestId, 'JOIN_FAILED', 'Unable to join room'))
      }
    })

    socket.on('room:reconnect', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = reconnectSchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid credentials'))
        }
        const { playerId, reconnectToken } = parsed.data
        const player = await prisma.player.findFirst({
          where: {
            id: playerId,
            reconnectTokenHash: hash(reconnectToken),
          },
          include: {
            card: true,
            room: true,
          },
        })

        if (!player) return cb(fail(requestId, 'UNAUTHORIZED', 'Reconnect credentials are invalid'))

        await prisma.player.update({
          where: { id: player.id },
          data: { connected: true },
        })

        socket.join(player.roomId)
        socket.data = { roomId: player.roomId, playerId: player.id, reconnectToken }

        const fullRoom = await getFullRoomState(player.roomId, true)
        io.to(player.roomId).emit('room:state', ok(requestId, fullRoom))

        cb(
          ok(requestId, {
            room: fullRoom,
            player,
          })
        )
      } catch (e) {
        log.error(e, 'Error in room:reconnect')
        cb(fail(requestId, 'RECONNECT_FAILED', 'Unable to reconnect'))
      }
    })

    socket.on('card:rearrange', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = rearrangeSchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', 'Invalid arrangement values'))
        }
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb(fail(requestId, 'UNAUTHORIZED', 'Not connected to a room'))

        const room = await prisma.room.findUnique({ where: { id: roomId } })
        const player = await prisma.player.findUnique({ where: { id: playerId }, include: { card: true } })

        if (!room || !player || room.state !== 'WAITING' || player.ready) {
          return cb(fail(requestId, 'REARRANGE_NOT_ALLOWED', 'Card cannot be rearranged now'))
        }

        const original = player.card?.values as number[]
        const arranged = parsed.data.values
        if (!player.card || !validateArrangement(original, arranged, player.card.size)) {
          return cb(fail(requestId, 'INVALID_CARD', 'Arrangement must contain the original numbers exactly once'))
        }

        const card = await prisma.bingoCard.update({
          where: { playerId },
          data: { values: arranged },
        })

        cb(ok(requestId, { card }))
      } catch (e) {
        log.error(e, 'Error in card:rearrange')
        cb(fail(requestId, 'REARRANGE_FAILED', 'Failed to update card arrangement'))
      }
    })

    socket.on('player:ready', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = readySchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', 'Ready status boolean required'))
        }
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb(fail(requestId, 'UNAUTHORIZED', 'Not connected to a room'))

        const { ready } = parsed.data
        await prisma.player.update({
          where: { id: playerId },
          data: { ready },
        })

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { players: true },
        })

        if (!room) return cb(fail(requestId, 'ROOM_NOT_FOUND', 'Room not found'))

        const eligiblePlayers = room.players.filter((p) => p.connected)
        const allReady = eligiblePlayers.length >= room.minPlayers && eligiblePlayers.every((p) => p.ready)

        if (allReady && room.state === 'WAITING') {
          await prisma.room.update({
            where: { id: roomId },
            data: { state: 'COUNTDOWN' },
          })
          startCountdownTimer(roomId, room.countdownSeconds)
        } else if (!allReady && room.state === 'COUNTDOWN') {
          await cancelCountdown(roomId)
        }

        const fullRoom = await getFullRoomState(roomId, true)
        io.to(roomId).emit('room:state', ok(requestId, fullRoom))
        cb(ok(requestId, { ready, allReady }))
      } catch (e) {
        log.error(e, 'Error in player:ready')
        cb(fail(requestId, 'READY_FAILED', 'Failed to update ready state'))
      }
    })

    socket.on('game:start', async (_rawPayload, cb) => {
      const requestId = socket.id
      try {
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb?.(fail(requestId, 'UNAUTHORIZED', 'Not connected'))

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { players: { orderBy: { position: 'asc' } } },
        })

        if (!room || room.hostPlayerId !== playerId) {
          return cb?.(fail(requestId, 'FORBIDDEN', 'Only the host can start the game'))
        }

        if (room.state !== 'WAITING') {
          return cb?.(fail(requestId, 'INVALID_STATE', 'Game has already started'))
        }

        const connectedPlayers = room.players.filter((p) => p.connected)
        if (connectedPlayers.length < room.minPlayers) {
          return cb?.(fail(requestId, 'NOT_ENOUGH_PLAYERS', `Need at least ${room.minPlayers} players to start`))
        }

        const unreadyPlayers = connectedPlayers.filter((p) => !p.ready)
        if (unreadyPlayers.length > 0) {
          const names = unreadyPlayers.map((p) => p.name).join(', ')
          return cb?.(fail(requestId, 'PLAYERS_NOT_READY', `All players must be ready: ${names}`, {
            unready: unreadyPlayers.map((p) => ({ id: p.id, name: p.name })),
          }))
        }

        await prisma.room.update({
          where: { id: roomId },
          data: { state: 'COUNTDOWN' },
        })

        startCountdownTimer(roomId, room.countdownSeconds)
        const fullRoom = await getFullRoomState(roomId, true)
        io.to(roomId).emit('room:state', ok(requestId, fullRoom))
        cb?.(ok(requestId, { started: true }))
      } catch (e) {
        log.error(e, 'Error in game:start')
        cb?.(fail(requestId, 'START_FAILED', 'Unable to start game'))
      }
    })

    socket.on('room:nudge', async (_rawPayload, cb) => {
      const requestId = socket.id
      try {
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb?.(fail(requestId, 'UNAUTHORIZED', 'Not connected'))

        const player = await prisma.player.findUnique({ where: { id: playerId } })
        if (!player) return cb?.(fail(requestId, 'PLAYER_NOT_FOUND', 'Player not found'))

        io.to(roomId).emit('room:nudge', ok('server', {
          senderId: player.id,
          senderName: player.name,
          message: `${player.name} is waiting for everyone to click "I am Ready to Play"!`
        }))
        cb?.(ok(requestId, { nudged: true }))
      } catch (e) {
        log.error(e, 'Error in room:nudge')
        cb?.(fail(requestId, 'NUDGE_FAILED', 'Failed to send reminder'))
      }
    })

    socket.on('game:select', async (rawPayload, cb) => {
      const requestId = socket.id
      try {
        const parsed = selectNumberSchema.safeParse(rawPayload)
        if (!parsed.success) {
          return cb(fail(requestId, 'INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid selection payload'))
        }
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb(fail(requestId, 'UNAUTHORIZED', 'Not connected to a room'))

        const room = await getFullRoomState(roomId)

        if (!room || room.state !== 'PLAYING') {
          return cb(fail(requestId, 'GAME_NOT_PLAYING', 'Game is not currently active'))
        }

        if (room.currentPlayerId !== playerId) {
          return cb(fail(requestId, 'OUT_OF_TURN', 'It is not your turn'))
        }

        const { number, idempotencyKey } = parsed.data
        if (number < room.rangeMin || number > room.rangeMax) {
          return cb(fail(requestId, 'OUT_OF_RANGE', `Number must be between ${room.rangeMin} and ${room.rangeMax}`))
        }

        // 1. Idempotency check in memory
        const existingSelection = (room.selections || []).find((s: any) => s.idempotencyKey === idempotencyKey)
        if (existingSelection) {
          return cb(ok(requestId, { alreadyHandled: true, selection: existingSelection }))
        }

        // 2. Reject duplicate number selections in memory
        const isDuplicate = (room.selections || []).some((s: any) => s.number === number)
        if (isDuplicate) {
          return cb(fail(requestId, 'SELECTION_FAILED', 'This number was already called'))
        }

        // Clear active 40s turn timer immediately
        clearTurnTimer(roomId)

        // 3. IN-MEMORY INSTANT STATE COMPUTATION (< 0.5ms)
        const selection = {
          id: `sel_${Date.now()}_${number}`,
          roomId,
          playerId,
          number,
          turnNumber: room.turnNumber,
          idempotencyKey,
          createdAt: new Date(),
        }
        if (!room.selections) room.selections = []
        room.selections.push(selection)

        const winners: { playerId: string; name: string; score: number; completedLines: number }[] = []
        const playersToDbUpdate: any[] = []

        for (const player of room.players) {
          if (!player.card) continue
          const cardValues = player.card.values as number[]
          let cardMarked = (player.card.marked as number[]) || []

          if (cardValues.includes(number) && !cardMarked.includes(number)) {
            cardMarked = [...cardMarked, number]
            player.card.marked = cardMarked
          }

          const currentCard: Card = {
            size: player.card.size,
            values: cardValues,
            marked: cardMarked,
          }

          const currentLines = completedLines(currentCard)
          if (!player.awardedLines) player.awardedLines = []
          const awardedLineIndices = new Set(player.awardedLines.map((l: any) => l.lineIndex))
          const newLines = currentLines.filter((idx) => !awardedLineIndices.has(idx))

          if (newLines.length > 0) {
            for (const lineIdx of newLines) {
              player.awardedLines.push({
                id: `line_${Date.now()}_${lineIdx}`,
                playerId: player.id,
                lineIndex: lineIdx,
              })
            }
            player.score = (player.score || 0) + newLines.length
            player.completedLines = (player.completedLines || 0) + newLines.length
          }

          playersToDbUpdate.push({
            playerId: player.id,
            cardMarked,
            newLines,
            score: player.score,
            completedLines: player.completedLines,
          })

          if (hasWon(currentCard, room.winningCondition as WinningCondition)) {
            winners.push({
              playerId: player.id,
              name: player.name,
              score: player.score,
              completedLines: player.completedLines,
            })
          }
        }

        let isFinished = false
        let nextPlayerId: string | null = null

        if (winners.length > 0) {
          isFinished = true
          winners.sort((a, b) => b.score - a.score)
          room.state = 'FINISHED'
          room.endedAt = new Date()
          room.turnNumber += 1
          room.gameStateVersion = (room.gameStateVersion || 0) + 1
        } else {
          // Advance turn to next active connected player
          const activePlayers = (room.players || []).filter((p: any) => p.connected)
          const currentIdx = activePlayers.findIndex((p: any) => p.id === playerId)
          const nextPlayer = activePlayers[(currentIdx + 1) % activePlayers.length] || room.players[0]
          nextPlayerId = nextPlayer.id

          room.turnNumber += 1
          room.gameStateVersion = (room.gameStateVersion || 0) + 1
          room.currentPlayerId = nextPlayerId
        }

        // Cache the updated room state
        roomCache.set(roomId, room)

        // 4. SUPERFAST WEBSOCKET BROADCAST (< 5ms LATENCY)
        if (isFinished) {
          io.to(roomId).emit(
            'game:finished',
            ok(requestId, {
              roomId,
              number,
              selectedBy: playerId,
              winners,
              room,
            })
          )
        } else {
          io.to(roomId).emit(
            'number:selected',
            ok(requestId, {
              roomId,
              number,
              selectedBy: playerId,
              nextPlayerId,
              room,
            })
          )
          // Start 40-second timer for the next player!
          startTurnTimer(roomId)
        }

        io.to(roomId).emit('room:state', ok(requestId, room))
        cb(ok(requestId, { selection, nextPlayerId, winners, finished: isFinished }))

        // 5. ASYNC BACKGROUND PERSISTENCE TO DATABASE (Non-blocking)
        persistGameSelection(
          roomId,
          playerId,
          number,
          idempotencyKey,
          room.turnNumber,
          isFinished,
          winners,
          playersToDbUpdate,
          nextPlayerId,
          room.players
        ).catch((err) => log.error(err, 'Async persistence error in game:select'))
      } catch (e: any) {
        log.error(e, 'Error in game:select')
        const message = e.message === 'NUMBER_ALREADY_CALLED' ? 'This number was already called' : 'Selection failed'
        cb(fail(requestId, 'SELECTION_FAILED', message))
      }
    })

    socket.on('game:claim', async (_rawPayload, cb) => {
      const requestId = socket.id
      try {
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb(fail(requestId, 'UNAUTHORIZED', 'Not connected'))

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { players: { include: { card: true } } },
        })

        if (!room || room.state !== 'PLAYING') {
          return cb(fail(requestId, 'INVALID_STATE', 'Game is not currently active'))
        }

        const player = room.players.find((p) => p.id === playerId)
        if (!player || !player.card) {
          return cb(fail(requestId, 'PLAYER_NOT_FOUND', 'Card not found'))
        }

        const card: Card = {
          size: player.card.size,
          values: player.card.values as number[],
          marked: player.card.marked as number[],
        }

        if (!hasWon(card, room.winningCondition)) {
          return cb(fail(requestId, 'INVALID_BINGO', 'Valid winning pattern not yet completed'))
        }

        // End game and announce winner
        await prisma.room.update({
          where: { id: roomId },
          data: {
            state: 'FINISHED',
            endedAt: new Date(),
          },
        })

        await prisma.gameResult.create({
          data: {
            roomId,
            playerId,
            rank: 1,
            winner: true,
            score: player.score,
            completedLines: player.completedLines,
          },
        })

        const fullRoom = await getFullRoomState(roomId, true)
        io.to(roomId).emit(
          'game:finished',
          ok(requestId, {
            roomId,
            winners: [{ playerId: player.id, name: player.name, score: player.score }],
            room: fullRoom,
          })
        )

        cb(ok(requestId, { won: true }))
      } catch (e) {
        log.error(e, 'Error in game:claim')
        cb(fail(requestId, 'CLAIM_FAILED', 'Failed to validate claim'))
      }
    })

    socket.on('room:restart', async (_rawPayload, cb) => {
      const requestId = socket.id
      try {
        const { roomId, playerId } = socket.data ?? {}
        if (!roomId || !playerId) return cb?.(fail(requestId, 'UNAUTHORIZED', 'Not connected'))

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { players: true },
        })

        if (!room || room.hostPlayerId !== playerId) {
          return cb?.(fail(requestId, 'FORBIDDEN', 'Only the host can start a new round'))
        }

        // Clean up selections, lines, and results for this room
        await prisma.numberSelection.deleteMany({ where: { roomId } })
        await prisma.gameResult.deleteMany({ where: { roomId } })

        for (const p of room.players) {
          await prisma.completedLine.deleteMany({ where: { playerId: p.id } })
          const freshCard = generateCard(room.cardSize, room.rangeMin, room.rangeMax)
          await prisma.bingoCard.update({
            where: { playerId: p.id },
            data: {
              values: freshCard.values,
              marked: freshCard.marked,
            },
          })
          await prisma.player.update({
            where: { id: p.id },
            data: {
              score: 0,
              completedLines: 0,
              ready: false,
            },
          })
        }

        await prisma.room.update({
          where: { id: roomId },
          data: {
            state: 'WAITING',
            turnNumber: 0,
            gameStateVersion: 0,
            currentPlayerId: null,
            startedAt: null,
            endedAt: null,
          },
        })

        clearTurnTimer(roomId)
        roomCache.delete(roomId)

        const fullRoom = await getFullRoomState(roomId, true)
        io.to(roomId).emit('room:restarted', ok(requestId, fullRoom))
        io.to(roomId).emit('room:state', ok(requestId, fullRoom))
        cb?.(ok(requestId, fullRoom))
      } catch (e) {
        log.error(e, 'Error in room:restart')
        cb?.(fail(requestId, 'RESTART_FAILED', 'Failed to restart room'))
      }
    })

    socket.on('room:cancel', async (_rawPayload, cb) => {
      const requestId = socket.id
      try {
        const { roomId, playerId } = socket.data ?? {}
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (!room || room.hostPlayerId !== playerId) {
          return cb(fail(requestId, 'FORBIDDEN', 'Only the host can cancel'))
        }
        clearTurnTimer(roomId)
        roomCache.delete(roomId)
        await cancelCountdown(roomId)
        await prisma.room.update({
          where: { id: roomId },
          data: { state: 'CANCELLED', endedAt: new Date() },
        })
        io.to(roomId).emit('room:cancelled', ok(requestId, {}))
        cb(ok(requestId, {}))
      } catch (e) {
        log.error(e, 'Error in room:cancel')
        cb(fail(requestId, 'CANCEL_FAILED', 'Failed to cancel room'))
      }
    })

    socket.on('disconnect', async () => {
      if (socket.data?.playerId) {
        const { roomId, playerId } = socket.data
        try {
          await prisma.player.updateMany({
            where: { id: playerId },
            data: { connected: false },
          })
          if (roomId) {
            const cached = roomCache.get(roomId)
            if (cached && cached.players) {
              const p = cached.players.find((pl: any) => pl.id === playerId)
              if (p) p.connected = false
            }

            const room = await prisma.room.findUnique({ where: { id: roomId } })
            if (room?.state === 'COUNTDOWN') {
              await cancelCountdown(roomId)
            }
            const fullRoom = await getFullRoomState(roomId, true)
            if (fullRoom) {
              io.to(roomId).emit('player:disconnected', ok('server', { playerId }))
              io.to(roomId).emit('room:state', ok('server', fullRoom))
            }
          }
        } catch {
          // ignore transient disconnect errors
        }
      }
    })
  })
}
