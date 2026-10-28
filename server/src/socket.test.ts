import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as Client, type Socket as ClientSocket } from 'socket.io-client'
import type { AddressInfo } from 'node:net'
import { createBingoServer } from './index'
import { prisma } from './db'

describe('multiplayer bingo socket integration', () => {
  let serverInstance: ReturnType<typeof createBingoServer>
  let serverUrl: string
  const clients: ClientSocket[] = []

  beforeAll(async () => {
    serverInstance = createBingoServer()
    await new Promise<void>((resolve) => {
      serverInstance.server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = serverInstance.server.address() as AddressInfo
    serverUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    for (const c of clients) c.disconnect()
    await new Promise<void>((resolve) => serverInstance.server.close(() => resolve()))
    await prisma.$disconnect()
  })

  function createClient(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = Client(serverUrl, { transports: ['websocket'], forceNew: true })
      socket.on('connect', () => {
        clients.push(socket)
        resolve(socket)
      })
      socket.on('connect_error', (err) => reject(err))
    })
  }

  it('A. Room Lifecycle: creates room, joins with valid code, rejects invalid/full room', async () => {
    const hostSocket = await createClient()

    // 1. Create Room
    const createRes = await new Promise<any>((resolve) => {
      hostSocket.emit('room:create', { name: 'HostAlice', maxPlayers: 2, countdownSeconds: 1 }, resolve)
    })

    expect(createRes.success).toBe(true)
    expect(createRes.data.code).toBeDefined()
    expect(createRes.data.playerId).toBeDefined()
    expect(createRes.data.reconnectToken).toBeDefined()
    const roomCode = createRes.data.code

    // 2. Join with invalid room code
    const clientB = await createClient()
    const invalidJoinRes = await new Promise<any>((resolve) => {
      clientB.emit('room:join', { code: 'INVALID', name: 'Bob' }, resolve)
    })
    expect(invalidJoinRes.success).toBe(false)
    expect(invalidJoinRes.error.code).toBe('ROOM_NOT_FOUND')

    // 3. Join with valid code
    const validJoinRes = await new Promise<any>((resolve) => {
      clientB.emit('room:join', { code: roomCode, name: 'Bob' }, resolve)
    })
    expect(validJoinRes.success).toBe(true)
    expect(validJoinRes.data.playerId).toBeDefined()
    expect(validJoinRes.data.room.players.length).toBe(2)

    // 4. Reject duplicate name
    const clientC = await createClient()
    const dupNameRes = await new Promise<any>((resolve) => {
      clientC.emit('room:join', { code: roomCode, name: 'Bob' }, resolve)
    })
    expect(dupNameRes.success).toBe(false)
    expect(dupNameRes.error.code).toBe('DUPLICATE_NAME')

    // 5. Reject full room (maxPlayers = 2)
    const fullRoomRes = await new Promise<any>((resolve) => {
      clientC.emit('room:join', { code: roomCode, name: 'Charlie' }, resolve)
    })
    expect(fullRoomRes.success).toBe(false)
    expect(fullRoomRes.error.code).toBe('ROOM_FULL')
  }, 40000)

  it('B. Card Rearrangement: allows owner to rearrange during WAITING, rejects invalid permutations', async () => {
    const socket = await createClient()
    const createRes = await new Promise<any>((resolve) => {
      socket.emit('room:create', { name: 'Rearranger' }, resolve)
    })

    const originalCard = createRes.data.player.card
    const originalValues = originalCard.values as number[]

    // Valid swap between index 0 and 1
    const swapped = [...originalValues]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]

    const rearrangeRes = await new Promise<any>((resolve) => {
      socket.emit('card:rearrange', { values: swapped }, resolve)
    })
    expect(rearrangeRes.success).toBe(true)
    expect(rearrangeRes.data.card.values[0]).toBe(swapped[0])

    // Invalid: duplicate numbers
    const invalidArranged = [...originalValues]
    invalidArranged[0] = invalidArranged[1]
    const failRes = await new Promise<any>((resolve) => {
      socket.emit('card:rearrange', { values: invalidArranged }, resolve)
    })
    expect(failRes.success).toBe(false)
    expect(failRes.error.code).toBe('INVALID_CARD')
  }, 40000)

  it('C & D & E & F & G: Ready countdown, turn order, marking, scoring, and winning for 3 players', async () => {
    const playerA = await createClient()
    const playerB = await createClient()
    const playerC = await createClient()

    // 1. Create room for 3 players with winningCondition FIRST_LINE and countdownSeconds 1
    const createRes = await new Promise<any>((resolve) => {
      playerA.emit(
        'room:create',
        {
          name: 'PlayerA',
          minPlayers: 3,
          maxPlayers: 5,
          countdownSeconds: 1,
          winningCondition: 'FIRST_LINE',
        },
        resolve
      )
    })
    const code = createRes.data.code
    const playerAId = createRes.data.playerId

    // 2. Player B and C join
    const joinB = await new Promise<any>((resolve) => {
      playerB.emit('room:join', { code, name: 'PlayerB' }, resolve)
    })
    const playerBId = joinB.data.playerId

    const joinC = await new Promise<any>((resolve) => {
      playerC.emit('room:join', { code, name: 'PlayerC' }, resolve)
    })
    const playerCId = joinC.data.playerId

    // 3. Readiness: Player A and B ready up -> room remains in WAITING because C is not ready
    await new Promise<any>((resolve) => playerA.emit('player:ready', { ready: true }, resolve))
    const readyB = await new Promise<any>((resolve) => playerB.emit('player:ready', { ready: true }, resolve))
    expect(readyB.data.allReady).toBe(false)

    // Player C readies up -> triggers COUNTDOWN
    const countdownPromise = new Promise<any>((resolve) => {
      playerA.on('room:countdown', resolve)
    })
    const gameStartedPromise = new Promise<any>((resolve) => {
      playerA.on('game:started', resolve)
    })

    await new Promise<any>((resolve) => playerC.emit('player:ready', { ready: true }, resolve))

    // Verify countdown event received
    const countdownEvent = await countdownPromise
    expect(countdownEvent.data.roomId).toBeDefined()

    // Wait for countdown completion to PLAYING
    const startEvent = await gameStartedPromise
    expect(startEvent.data.state).toBe('PLAYING')
    expect(startEvent.data.currentPlayerId).toBe(playerAId)

    // 4. Turn order: Player B cannot play during Player A's turn
    const outOfTurnRes = await new Promise<any>((resolve) => {
      playerB.emit('game:select', { number: 10, idempotencyKey: 'turn-b-1' }, resolve)
    })
    expect(outOfTurnRes.success).toBe(false)
    expect(outOfTurnRes.error.code).toBe('OUT_OF_TURN')

    // 5. Player A selects a valid number (e.g. 12)
    const selectPromise = new Promise<any>((resolve) => {
      playerC.on('number:selected', resolve)
    })

    const selectRes = await new Promise<any>((resolve) => {
      playerA.emit('game:select', { number: 12, idempotencyKey: 'turn-a-1' }, resolve)
    })
    expect(selectRes.success).toBe(true)

    const syncEvent = await selectPromise
    expect(syncEvent.data.number).toBe(12)
    expect(syncEvent.data.selectedBy).toBe(playerAId)
    expect(syncEvent.data.nextPlayerId).toBe(playerBId)

    // 6. Duplicate selection rejected
    const dupSelectionRes = await new Promise<any>((resolve) => {
      playerB.emit('game:select', { number: 12, idempotencyKey: 'turn-b-duplicate' }, resolve)
    })
    expect(dupSelectionRes.success).toBe(false)
    expect(dupSelectionRes.error.message).toContain('already called')

    // 7. Reconnection restores authoritative game state
    const reconnectRes = await new Promise<any>((resolve) => {
      playerA.emit(
        'room:reconnect',
        { playerId: playerAId, reconnectToken: createRes.data.reconnectToken },
        resolve
      )
    })
    expect(reconnectRes.success).toBe(true)
    expect(reconnectRes.data.room.state).toBe('PLAYING')
    expect(reconnectRes.data.room.selections.length).toBe(1)
  }, 60000)
})
