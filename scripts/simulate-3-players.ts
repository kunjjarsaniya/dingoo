import { io } from 'socket.io-client'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function simulate() {
  console.log(`\n🎲 --- STARTING 3-PLAYER BINGO MULTIPLAYER SIMULATION ---`)
  console.log(`Connecting to server: ${SERVER_URL}\n`)

  const socketA = io(SERVER_URL, { transports: ['websocket'] })
  const socketB = io(SERVER_URL, { transports: ['websocket'] })
  const socketC = io(SERVER_URL, { transports: ['websocket'] })

  await Promise.all([
    new Promise((res) => socketA.on('connect', () => res(true))),
    new Promise((res) => socketB.on('connect', () => res(true))),
    new Promise((res) => socketC.on('connect', () => res(true))),
  ])
  console.log('✅ All 3 client sockets connected.')

  // 1. Host creates room
  const createRes: any = await new Promise((res) => {
    socketA.emit(
      'room:create',
      {
        name: 'Alice (Host)',
        minPlayers: 3,
        maxPlayers: 5,
        countdownSeconds: 3,
        winningCondition: 'FIRST_LINE',
      },
      res
    )
  })

  if (!createRes.success) {
    console.error('❌ Failed to create room:', createRes.error)
    process.exit(1)
  }

  const roomCode = createRes.data.code
  const playerAId = createRes.data.playerId
  console.log(`🏠 Room created! Code: [ ${roomCode} ] | Host: Alice (${playerAId})`)

  // 2. Bob and Charlie join
  const joinB: any = await new Promise((res) => {
    socketB.emit('room:join', { code: roomCode, name: 'Bob' }, res)
  })
  console.log(`👋 Bob joined the room! (${joinB.data.playerId})`)

  const joinC: any = await new Promise((res) => {
    socketC.emit('room:join', { code: roomCode, name: 'Charlie' }, res)
  })
  console.log(`👋 Charlie joined the room! (${joinC.data.playerId})`)

  // Listen to countdown and game start
  socketA.on('room:countdown', (event: any) => {
    console.log(`⏳ COUNTDOWN: ${event.data.remaining}s remaining...`)
  })

  socketA.on('game:started', (event: any) => {
    console.log(`\n🚀 GAME STARTED! Current turn player: ${event.data.currentPlayerId}`)
  })

  socketB.on('number:selected', (event: any) => {
    console.log(
      `📢 NUMBER CALLED: [ ${event.data.number} ] by ${event.data.selectedBy}. Next turn: ${event.data.nextPlayerId}`
    )
  })

  socketA.on('game:finished', (event: any) => {
    console.log(`\n🏆 GAME OVER! Winner announced:`, event.data.winners)
  })

  // 3. All players ready up
  console.log('\n👍 Players setting Ready status...')
  await new Promise((res) => socketA.emit('player:ready', { ready: true }, res))
  console.log('  - Alice is READY')
  await new Promise((res) => socketB.emit('player:ready', { ready: true }, res))
  console.log('  - Bob is READY')
  await new Promise((res) => socketC.emit('player:ready', { ready: true }, res))
  console.log('  - Charlie is READY (All ready! Countdown triggered)')

  // Wait for countdown (3s) + buffer
  console.log('Waiting for countdown to finish...')
  await delay(4500)

  // 4. Play turns: Alice selects a number
  console.log('\n🎯 Alice making turn 1 selection...')
  const select1: any = await new Promise((res) => {
    socketA.emit('game:select', { number: 7, idempotencyKey: `turn-${Date.now()}-1` }, res)
  })
  console.log('Alice selection response:', select1.success ? 'ACCEPTED' : select1.error)

  await delay(1000)

  // 5. Bob makes turn 2 selection
  console.log('🎯 Bob making turn 2 selection...')
  const select2: any = await new Promise((res) => {
    socketB.emit('game:select', { number: 22, idempotencyKey: `turn-${Date.now()}-2` }, res)
  })
  console.log('Bob selection response:', select2.success ? 'ACCEPTED' : select2.error)

  await delay(1000)

  // 6. Charlie makes turn 3 selection
  console.log('🎯 Charlie making turn 3 selection...')
  const select3: any = await new Promise((res) => {
    socketC.emit('game:select', { number: 15, idempotencyKey: `turn-${Date.now()}-3` }, res)
  })
  console.log('Charlie selection response:', select3.success ? 'ACCEPTED' : select3.error)

  await delay(1500)

  console.log('\n✨ Simulation completed successfully! Disconnecting sockets.\n')
  socketA.disconnect()
  socketB.disconnect()
  socketC.disconnect()
  process.exit(0)
}

simulate().catch((err) => {
  console.error('Simulation error:', err)
  process.exit(1)
})
