'use client'

import React, { useEffect, useMemo, useState } from 'react'
import confetti from 'canvas-confetti'
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Crown,
  Dices,
  Flame,
  HelpCircle,
  LockKeyhole,
  Medal,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  ArrowUpDown,
  Volume2,
  Layers,
  Star,
  Clock,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSocket } from '@/lib/socket'
import { DingooLogo } from '@/components/dingoo-logo'

type Screen = 'home' | 'lobby' | 'game' | 'winner'
type Mode = 'create' | 'join'

interface PlayerData {
  id: string
  name: string
  position: number
  ready: boolean
  connected: boolean
  score: number
  completedLines: number
  card?: {
    size: number
    values: number[]
    marked: number[]
  }
}

interface RoomData {
  id: string
  code: string
  state: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED' | 'CANCELLED'
  hostPlayerId: string
  cardSize: number
  rangeMin: number
  rangeMax: number
  minPlayers: number
  maxPlayers: number
  countdownSeconds: number
  winningCondition: 'FIRST_LINE' | 'FIVE_LINES' | 'FULL_CARD'
  turnNumber: number
  currentPlayerId: string | null
  players: PlayerData[]
  selections: { number: number; turnNumber: number; playerId: string }[]
  results?: { rank: number; winner: boolean; score: number; completedLines: number; playerId: string }[]
}

const PLAYER_CHIP_COLORS = [
  'bg-[oklch(68%_0.21_24)] text-white',
  'bg-[oklch(82%_0.15_152)] text-[oklch(20%_0.014_255)]',
  'bg-[oklch(87%_0.175_96)] text-[oklch(20%_0.014_255)]',
  'bg-[oklch(84%_0.11_236)] text-[oklch(20%_0.014_255)]',
  'bg-[oklch(89%_0.035_236)] text-[oklch(20%_0.014_255)]',
]

function getLetter(number: number): string {
  if (number === 0) return 'FREE'
  if (number <= 15) return 'B'
  if (number <= 30) return 'I'
  if (number <= 45) return 'N'
  if (number <= 60) return 'G'
  return 'O'
}

function getLetterTheme(letter: string) {
  switch (letter) {
    case 'B':
      return { bg: 'bg-[oklch(68%_0.21_24)]', text: 'text-white', border: 'border-[oklch(68%_0.21_24)]' }
    case 'I':
      return { bg: 'bg-[oklch(87%_0.175_96)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(87%_0.175_96)]' }
    case 'N':
      return { bg: 'bg-[oklch(82%_0.15_152)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(82%_0.15_152)]' }
    case 'G':
      return { bg: 'bg-[oklch(84%_0.11_236)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(84%_0.11_236)]' }
    case 'O':
    default:
      return { bg: 'bg-[oklch(68%_0.21_24)]', text: 'text-white', border: 'border-[oklch(68%_0.21_24)]' }
  }
}

function getColumnHeaders(size: number): string[] {
  if (size === 5) return ['B', 'I', 'N', 'G', 'O']
  return Array.from({ length: size }, (_, i) => `${i + 1}`)
}

function getColumnTheme(colIndex: number, size: number) {
  if (size === 5) {
    const letters = ['B', 'I', 'N', 'G', 'O']
    return getLetterTheme(letters[colIndex] || 'B')
  }
  const themes = [
    { bg: 'bg-[oklch(68%_0.21_24)]', text: 'text-white', border: 'border-[oklch(68%_0.21_24)]' },
    { bg: 'bg-[oklch(87%_0.175_96)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(87%_0.175_96)]' },
    { bg: 'bg-[oklch(82%_0.15_152)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(82%_0.15_152)]' },
    { bg: 'bg-[oklch(84%_0.11_236)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(84%_0.11_236)]' },
    { bg: 'bg-[oklch(89%_0.035_236)]', text: 'text-[oklch(20%_0.014_255)]', border: 'border-[oklch(89%_0.035_236)]' },
  ]
  return themes[colIndex % themes.length]
}

function getBallLabel(number: number, rangeMax: number, size: number): string {
  if (size === 5 && rangeMax === 75) {
    return `${getLetter(number)}-${number}`
  }
  return `#${number}`
}

export default function BingoApp() {
  const [screen, setScreen] = useState<Screen>('home')
  const [mode, setMode] = useState<Mode>('create')
  const [displayName, setDisplayName] = useState('')
  const [cardSizeN, setCardSizeN] = useState<number | string>(5)
  const [inputCode, setInputCode] = useState('')
  const [winningCondition, setWinningCondition] = useState<'FIRST_LINE' | 'FIVE_LINES' | 'FULL_CARD'>('FIVE_LINES')

  // Auth / session state
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [reconnectToken, setReconnectToken] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomData | null>(null)
  const [playerCard, setPlayerCard] = useState<{ size: number; values: number[]; marked: number[] } | null>(null)

  // Live state
  const [countdown, setCountdown] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedSwapIdx, setSelectedSwapIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [showNotReadyModal, setShowNotReadyModal] = useState(false)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [lastSwappedPair, setLastSwappedPair] = useState<[number, number] | null>(null)
  const touchStartIdx = React.useRef<number | null>(null)

  // Interactive Moments & Hero Demo state
  const [activeMomentTab, setActiveMomentTab] = useState<'rearrange' | 'ready' | 'calling' | 'victory'>('rearrange')
  const [demoMarked, setDemoMarked] = useState<number[]>([12, 38])
  const [demoTimeLeft, setDemoTimeLeft] = useState('4:12')
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState<number>(40)
  const [savedSessionInfo, setSavedSessionInfo] = useState<{ roomCode: string; name: string } | null>(null)

  // Demo Step 1: Card swap state
  const [demoSwapValues, setDemoSwapValues] = useState<number[]>([
    6, 4, 13, 8, 9,
    12, 10, 20, 5, 16,
    2, 22, 11, 7, 1,
    17, 25, 23, 24, 15,
    14, 21, 19, 3, 18,
  ])
  const [demoSelectedSwap, setDemoSelectedSwap] = useState<number | null>(null)
  const [demoSwapNotice, setDemoSwapNotice] = useState<string | null>(null)

  // Demo Step 2: Lobby readiness & nudge
  const [demoRohitReady, setDemoRohitReady] = useState(false)
  const [demoShowUnreadyAlert, setDemoShowUnreadyAlert] = useState(false)
  const [demoNudgeSent, setDemoNudgeSent] = useState(false)
  const [demoGameLaunched, setDemoGameLaunched] = useState(false)

  // Demo Step 3: Turn-based calling
  const [demoCalledNumbers, setDemoCalledNumbers] = useState<number[]>([6, 12, 22, 5])
  const [demoCurrentTurn, setDemoCurrentTurn] = useState<string>('You')
  const [demoLastCallNotice, setDemoLastCallNotice] = useState<string | null>('Your Turn! Click any unmarked tile below.')

  // Demo Step 4: 5-Line Victory
  const [demoWinMarked, setDemoWinMarked] = useState<number[]>([
    6, 4, 13, 8, 9, // Row 0
    2, 22, 11, 7, 1, // Row 2
    10, 25, // Col 1
    16, 15, 18, // Col 4
    24, // Diagonal component (needs 21 to complete 5th line!)
  ])
  const [demoHasWon, setDemoHasWon] = useState(false)

  const socket = getSocket()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((curr) => (curr === msg ? null : curr)), 4000)
  }

  // Restore session from localStorage on mount & socket connect
  useEffect(() => {
    const attemptReconnect = () => {
      const saved = localStorage.getItem('bingo_session')
      if (!saved) return
      try {
        const parsed = JSON.parse(saved)
        const { savedPlayerId, savedToken, savedRoomCode, savedName } = parsed
        if (savedRoomCode && savedName) {
          setSavedSessionInfo({ roomCode: savedRoomCode, name: savedName })
        }

        if (savedPlayerId && savedToken) {
          socket.emit(
            'room:reconnect',
            { playerId: savedPlayerId, reconnectToken: savedToken },
            (res: any) => {
              if (res?.success) {
                setPlayerId(savedPlayerId)
                setReconnectToken(savedToken)
                setRoom(res.data.room)
                if (res.data.player?.card) {
                  setPlayerCard(res.data.player.card)
                }
                if (res.data.room.state === 'PLAYING') {
                  setScreen('game')
                } else if (res.data.room.state === 'FINISHED') {
                  setScreen('winner')
                } else {
                  setScreen('lobby')
                }
                showToast(`Reconnected as ${res.data.player.name}`)
              } else if (savedRoomCode && savedName) {
                // Fallback attempt: rejoin by code & name
                socket.emit(
                  'room:join',
                  { code: savedRoomCode, name: savedName },
                  (joinRes: any) => {
                    if (joinRes?.success) {
                      setPlayerId(joinRes.data.playerId)
                      setReconnectToken(joinRes.data.reconnectToken)
                      setRoom(joinRes.data.room)
                      if (joinRes.data.player?.card) {
                        setPlayerCard(joinRes.data.player.card)
                      }
                      if (joinRes.data.room.state === 'PLAYING') {
                        setScreen('game')
                      } else if (joinRes.data.room.state === 'FINISHED') {
                        setScreen('winner')
                      } else {
                        setScreen('lobby')
                      }
                      showToast(`Reconnected as ${joinRes.data.player.name}`)
                    }
                  }
                )
              }
            }
          )
        }
      } catch {
        // ignore parse error
      }
    }

    if (socket.connected) {
      attemptReconnect()
    }
    socket.on('connect', attemptReconnect)

    return () => {
      socket.off('connect', attemptReconnect)
    }
  }, [socket])

  // Real-time socket event listeners
  useEffect(() => {
    const handleRoomState = (res: any) => {
      if (!res?.data) return
      const updated: RoomData = res.data
      setRoom(updated)

      if (playerId) {
        const me = updated.players?.find((p) => p.id === playerId)
        if (me?.card) {
          setPlayerCard(me.card)
        }
      }

      if (updated.state === 'PLAYING' && screen !== 'game') {
        setScreen('game')
      } else if (updated.state === 'FINISHED' && screen !== 'winner') {
        setScreen('winner')
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.55 } })
      } else if (updated.state === 'WAITING' && screen === 'winner') {
        setScreen('lobby')
      }
    }

    const handleCountdown = (res: any) => {
      setCountdown(res?.data?.remaining ?? null)
    }

    const handleCountdownCancelled = () => {
      setCountdown(null)
      showToast('Countdown cancelled — a player is not ready')
    }

    const handleGameStarted = () => {
      setCountdown(null)
      setTurnSecondsRemaining(40)
      setScreen('game')
      showToast('Game has started! Good luck!')
    }

    const handleNumberSelected = (res: any) => {
      const num = res.data?.number
      setTurnSecondsRemaining(40)
      showToast(`Number called: ${getLetter(num)}-${num}`)
    }

    const handleGameFinished = (res: any) => {
      setScreen('winner')
      confetti({ particleCount: 160, spread: 100, origin: { y: 0.5 } })
      const winnerName = res.data?.winners?.[0]?.name || 'Someone'
      showToast(`🎉 BINGO! ${winnerName} won the game!`)
    }

    const handleTurnTick = (res: any) => {
      if (typeof res?.data?.remaining === 'number') {
        setTurnSecondsRemaining(res.data.remaining)
      }
    }

    const handleTurnTimeout = () => {
      setTurnSecondsRemaining(40)
      showToast('⏳ 40s expired! Turn passed to next player.')
    }

    const handleRoomRestarted = () => {
      setScreen('lobby')
      setTurnSecondsRemaining(40)
      showToast('Host restarted the game for another round!')
    }

    const handleRoomCancelled = () => {
      setScreen('home')
      setRoom(null)
      setSavedSessionInfo(null)
      localStorage.removeItem('bingo_session')
      showToast('Room was cancelled by the host')
    }

    const handleRoomNudge = (res: any) => {
      const msg = res.data?.message || 'Host is waiting for everyone to get ready!'
      showToast(`🔔 ${msg}`)
    }

    socket.on('room:state', handleRoomState)
    socket.on('room:countdown', handleCountdown)
    socket.on('room:countdown_cancelled', handleCountdownCancelled)
    socket.on('room:nudge', handleRoomNudge)
    socket.on('game:started', handleGameStarted)
    socket.on('number:selected', handleNumberSelected)
    socket.on('game:finished', handleGameFinished)
    socket.on('turn:tick', handleTurnTick)
    socket.on('turn:timeout', handleTurnTimeout)
    socket.on('room:restarted', handleRoomRestarted)
    socket.on('room:cancelled', handleRoomCancelled)

    return () => {
      socket.off('room:state', handleRoomState)
      socket.off('room:countdown', handleCountdown)
      socket.off('room:countdown_cancelled', handleCountdownCancelled)
      socket.off('room:nudge', handleRoomNudge)
      socket.off('game:started', handleGameStarted)
      socket.off('number:selected', handleNumberSelected)
      socket.off('game:finished', handleGameFinished)
      socket.off('turn:tick', handleTurnTick)
      socket.off('turn:timeout', handleTurnTimeout)
      socket.off('room:restarted', handleRoomRestarted)
      socket.off('room:cancelled', handleRoomCancelled)
    }
  }, [socket, playerId, screen])

  const currentPlayer = useMemo(
    () => room?.players?.find((p) => p.id === playerId),
    [room, playerId]
  )
  const isHost = room?.hostPlayerId === playerId
  const isMyTurn = room?.currentPlayerId === playerId

  const calledNumbers = useMemo(
    () => (room?.selections ? [...room.selections].reverse().map((s) => s.number) : []),
    [room?.selections]
  )

  // Actions
  const handleCreateRoom = () => {
    if (!displayName.trim()) return showToast('Please enter your name')
    const parsedN = parseInt(String(cardSizeN), 10)
    if (isNaN(parsedN) || parsedN < 5 || parsedN > 10) {
      return showToast('Please enter a valid card size number between 5 and 10 (e.g. 5)')
    }
    const n = parsedN
    setLoading(true)
    socket.emit(
      'room:create',
      {
        name: displayName.trim(),
        cardSize: n,
        rangeMin: 1,
        rangeMax: n * n,
        minPlayers: 1,
        maxPlayers: 10,
        winningCondition: 'FIVE_LINES',
        countdownSeconds: 3,
      },
      (res: any) => {
        setLoading(false)
        if (res.success) {
          setPlayerId(res.data.playerId)
          setReconnectToken(res.data.reconnectToken)
          setRoom(res.data.room)
          setPlayerCard(res.data.player?.card)
          localStorage.setItem(
            'bingo_session',
            JSON.stringify({
              savedPlayerId: res.data.playerId,
              savedToken: res.data.reconnectToken,
              savedRoomCode: res.data.code,
              savedName: displayName.trim(),
            })
          )
          setSavedSessionInfo({ roomCode: res.data.code, name: displayName.trim() })
          setScreen('lobby')
          showToast(`Room created! Card: ${n}×${n} (1-${n * n})`)
        } else {
          showToast(res.error?.message || 'Failed to create room')
        }
      }
    )
  }

  const handleJoinRoom = () => {
    if (!displayName.trim()) return showToast('Please enter your name')
    if (!inputCode.trim()) return showToast('Please enter a room code')
    setLoading(true)
    const normalizedCode = inputCode.trim().toUpperCase()
    const normalizedName = displayName.trim()

    socket.emit(
      'room:join',
      {
        code: normalizedCode,
        name: normalizedName,
      },
      (res: any) => {
        setLoading(false)
        if (res.success) {
          setPlayerId(res.data.playerId)
          setReconnectToken(res.data.reconnectToken)
          setRoom(res.data.room)
          setPlayerCard(res.data.player?.card)
          localStorage.setItem(
            'bingo_session',
            JSON.stringify({
              savedPlayerId: res.data.playerId,
              savedToken: res.data.reconnectToken,
              savedRoomCode: normalizedCode,
              savedName: normalizedName,
            })
          )
          setSavedSessionInfo({ roomCode: normalizedCode, name: normalizedName })
          if (res.data.room?.state === 'PLAYING') {
            setScreen('game')
          } else if (res.data.room?.state === 'FINISHED') {
            setScreen('winner')
          } else {
            setScreen('lobby')
          }
          showToast(res.data.reconnected ? 'Reconnected to your seat!' : 'Joined room successfully!')
        } else {
          showToast(res.error?.message || 'Failed to join room')
        }
      }
    )
  }

  const handleToggleReady = () => {
    if (!currentPlayer) return
    const nextReady = !currentPlayer.ready
    if (nextReady) {
      setSelectedSwapIdx(null)
      setDraggedIdx(null)
      setDragOverIdx(null)
    }
    socket.emit('player:ready', { ready: nextReady }, (res: any) => {
      if (!res.success) {
        showToast(res.error?.message || 'Failed to update ready state')
      } else {
        if (nextReady) {
          showToast('Card locked in! You are ready to play.')
        } else {
          showToast('Card unlocked. You can now drag or tap numbers to rearrange.')
        }
      }
    })
  }

  const handleHostStart = () => {
    if (!room) return
    const connectedPlayers = room.players.filter((p) => p.connected)
    const unready = connectedPlayers.filter((p) => !p.ready)

    if (unready.length > 0) {
      setShowNotReadyModal(true)
      return
    }

    if (connectedPlayers.length < room.minPlayers) {
      showToast(`Need at least ${room.minPlayers} players to begin!`)
      return
    }

    socket.emit('game:start', {}, (res: any) => {
      if (!res?.success) {
        if (res?.error?.code === 'PLAYERS_NOT_READY') {
          setShowNotReadyModal(true)
        } else {
          showToast(res?.error?.message || 'Cannot start game yet')
        }
      }
    })
  }

  const handleSendNudge = () => {
    socket.emit('room:nudge', {}, (res: any) => {
      if (res?.success) {
        showToast('Reminder sent to all players!')
      }
    })
  }

  const performSwap = (sourceIdx: number, targetIdx: number) => {
    if (!playerCard || currentPlayer?.ready || room?.state !== 'WAITING') {
      if (currentPlayer?.ready) {
        showToast('Card is locked. Tap "Unlock Card" to rearrange.')
      }
      return
    }
    if (sourceIdx === targetIdx) return
    if (playerCard.values[sourceIdx] === 0 || playerCard.values[targetIdx] === 0) return

    const newValues = [...playerCard.values]
    const temp = newValues[sourceIdx]
    newValues[sourceIdx] = newValues[targetIdx]
    newValues[targetIdx] = temp

    const applySwap = () => {
      setPlayerCard((prev) => (prev ? { ...prev, values: newValues } : null))
      setLastSwappedPair([sourceIdx, targetIdx])
      setTimeout(() => setLastSwappedPair(null), 400)
    }

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        applySwap()
      })
    } else {
      applySwap()
    }

    socket.emit('card:rearrange', { values: newValues }, (res: any) => {
      if (res?.success) {
        showToast(`Swapped ${temp} and ${newValues[sourceIdx]}!`)
      } else {
        setPlayerCard(playerCard)
        showToast(res?.error?.message || 'Rearrangement rejected')
      }
    })
  }

  const handleSwapCardCells = (idx: number) => {
    if (!playerCard || currentPlayer?.ready || room?.state !== 'WAITING') {
      if (currentPlayer?.ready) {
        showToast('Card is locked. Tap "Unlock Card" to rearrange.')
      }
      return
    }
    if (playerCard.values[idx] === 0) return

    if (selectedSwapIdx === null) {
      setSelectedSwapIdx(idx)
    } else {
      if (selectedSwapIdx !== idx) {
        performSwap(selectedSwapIdx, idx)
      }
      setSelectedSwapIdx(null)
    }
  }

  const handleSelectCardNumber = (number: number) => {
    if (number === 0 || !isMyTurn || room?.state !== 'PLAYING') return
    if (calledNumbers.includes(number)) return

    // Optimistic local mark for lightning-fast immediate responsiveness
    if (playerCard && !playerCard.marked.includes(number)) {
      setPlayerCard({
        ...playerCard,
        marked: [...playerCard.marked, number],
      })
    }

    socket.emit(
      'game:select',
      { number, idempotencyKey: `cell-${Date.now()}-${number}` },
      (res: any) => {
        if (!res?.success) showToast(res?.error?.message || 'Cannot select number')
      }
    )
  }

  const handleClaimBingo = () => {
    socket.emit('game:claim', {}, (res: any) => {
      if (!res?.success) showToast(res?.error?.message || 'Winning pattern is not yet complete!')
    })
  }

  const handlePlayAnotherRound = () => {
    socket.emit('room:restart', {}, (res: any) => {
      if (!res?.success) showToast(res?.error?.message || 'Failed to restart')
    })
  }

  const handleLeaveRoom = () => {
    localStorage.removeItem('bingo_session')
    setSavedSessionInfo(null)
    setPlayerId(null)
    setRoom(null)
    setPlayerCard(null)
    setScreen('home')
  }

  const handleCopyRoomCode = () => {
    if (!room?.code) return
    navigator.clipboard?.writeText(room.code)
    setCopied(true)
    showToast(`Room code ${room.code} copied!`)
    setTimeout(() => setCopied(false), 2000)
  }

  // Toast notification rendered in Hallmark style
  const renderToast = () => {
    if (!toast) return null
    return (
      <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="flex items-center gap-2.5 rounded-full border border-[oklch(20%_0.014_255/15%)] bg-[#ffffff] px-6 py-3 text-sm font-semibold text-[oklch(20%_0.014_255)] shadow-[0_12px_28px_-6px_rgba(28,29,34,0.18)]">
          <Sparkles className="size-4 text-[oklch(68%_0.21_24)]" />
          <span>{toast}</span>
        </div>
      </div>
    )
  }

  // ----------------------------------------------------
  // SCREEN 1: HOME (Hallmark "Hum" Theme)
  // ----------------------------------------------------
  if (screen === 'home') {
    const demoTiles = [
      { letter: 'B', num: 12, label: 'B-12' },
      { letter: 'I', num: 24, label: 'I-24' },
      { letter: 'N', num: 38, label: 'N-38' },
      { letter: 'G', num: 51, label: 'G-51' },
      { letter: 'O', num: 67, label: 'O-67' },
    ]

    return (
      <main className="min-h-screen text-[oklch(20%_0.014_255)]">
        {renderToast()}

        {/* Hallmark Torn-Paper Nav Header */}
        <header className="bar-torn">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
            <a href="#top" className="flex items-center no-underline">
              <DingooLogo size="md" />
            </a>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const el = document.getElementById('play-card')
                  el?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="btn-hallmark btn-hallmark-pear btn-hallmark-sm"
              >
                Start free
              </button>
            </div>
          </div>
        </header>

        {/* Active Session Reconnect Banner (If user refreshed or returned) */}
        {savedSessionInfo && (
          <div className="mx-auto max-w-7xl px-6 pt-6 sm:px-10">
            <div className="card-curled p-4 sm:p-5 border-2 border-[oklch(68%_0.21_24/40%)] bg-[oklch(68%_0.21_24/8%)] flex flex-wrap items-center justify-between gap-4 shadow-sm rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-2xl bg-[oklch(68%_0.21_24)] text-white font-bold flex items-center justify-center text-base shadow-xs">
                  🎮
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="chip-stamp chip-coral text-[10px] py-0.5">Active Game Session</span>
                    <span className="font-mono text-sm font-black text-[oklch(20%_0.014_255)]">
                      ROOM {savedSessionInfo.roomCode}
                    </span>
                  </div>
                  <p className="text-xs text-[oklch(35%_0.014_255)] mt-1">
                    Playing as <strong className="text-[oklch(20%_0.014_255)]">{savedSessionInfo.name}</strong>. Rejoin now to resume your card, marked tiles, and score!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true)
                    socket.emit(
                      'room:join',
                      { code: savedSessionInfo.roomCode, name: savedSessionInfo.name },
                      (res: any) => {
                        setLoading(false)
                        if (res?.success) {
                          setPlayerId(res.data.playerId)
                          setReconnectToken(res.data.reconnectToken)
                          setRoom(res.data.room)
                          setPlayerCard(res.data.player?.card)
                          if (res.data.room?.state === 'PLAYING') setScreen('game')
                          else if (res.data.room?.state === 'FINISHED') setScreen('winner')
                          else setScreen('lobby')
                          showToast(`Welcome back to Room ${savedSessionInfo.roomCode}!`)
                        } else {
                          showToast(res?.error?.message || 'Room no longer available')
                        }
                      }
                    )
                  }}
                  className="btn-hallmark btn-hallmark-coral btn-hallmark-sm text-xs font-bold"
                >
                  ⚡️ Rejoin My Seat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('bingo_session')
                    setSavedSessionInfo(null)
                  }}
                  className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm text-xs"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section id="top" className="relative mx-auto max-w-7xl px-6 pt-12 pb-24 sm:px-10 lg:pt-16 lg:pb-32">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            {/* Left Headline */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[oklch(20%_0.014_255/12%)] bg-[oklch(94.8%_0.018_95)] px-3.5 py-1.5 text-xs font-bold text-[oklch(30%_0.014_255)]">
                <Sparkles className="size-3.5 text-[oklch(68%_0.21_24)]" />
                Playful Real-Time Bingo for Game Night
              </div>

              <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl lg:text-[5.25rem]">
                Play a little.
                <br />
                <span className="text-[oklch(68%_0.21_24)]">Win a round.</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[oklch(40%_0.014_255)] sm:text-xl">
                A delightful live multiplayer Bingo game for your friends, family, and colleagues. Every tile presses down like thick card stock, synchronizing instantly across screens.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => {
                    const el = document.getElementById('play-card')
                    el?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  variant="coral"
                  size="lg"
                >
                  Join or create a room <ArrowRight className="size-5" />
                </Button>

                <a
                  href="#round"
                  className="btn-hallmark btn-hallmark-secondary btn-hallmark-lg"
                >
                  See a round
                </a>
              </div>

              {/* Badges */}
              <div className="mt-10 flex flex-wrap gap-4 text-xs font-semibold text-[oklch(45%_0.014_255)]">
                <span className="flex items-center gap-1.5 rounded-lg bg-[oklch(94.8%_0.018_95)] px-3 py-1.5">
                  <Users className="size-4 text-[oklch(68%_0.21_24)]" /> 2 to 10 players
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[oklch(94.8%_0.018_95)] px-3 py-1.5">
                  <Radio className="size-4 text-[oklch(82%_0.15_152)]" /> WebSockets Sync
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[oklch(94.8%_0.018_95)] px-3 py-1.5">
                  <LockKeyhole className="size-4 text-[oklch(84%_0.11_236)]" /> Reconnect Anytime
                </span>
              </div>
            </div>

            {/* Right Playable Hallmark Demo Card */}
            <div className="relative">
              <div className="card-curled-wrap">
                {/* Backing rotated lavender mat */}
                <div className="sheet-mat" />

                {/* Stamped Die-Cut Sticker */}
                <div className="sticker-stamp -top-5 -right-3">
                  <span className="text-[11px] uppercase tracking-wider">Free to Play</span>
                  <span className="text-sm">Instant room sync</span>
                </div>

                {/* Main Card with Curled Corner */}
                <div className="card-curled p-6 sm:p-8 border border-[oklch(20%_0.014_255/8%)]">
                  {/* Card top: status and sand timer */}
                  <div className="flex items-center justify-between pb-5 border-b border-[oklch(20%_0.014_255/8%)]">
                    <div className="flex items-center gap-2">
                      <span className="knob text-xs">Today's Round</span>
                      <span className="chip-stamp chip-coral text-[10px]">Live Demo</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[oklch(35%_0.014_255)]">
                      <span className="font-mono text-sm font-bold text-[oklch(20%_0.014_255)]">{demoTimeLeft}</span>
                      <span>left</span>
                    </div>
                  </div>

                  {/* Sand Timer Track */}
                  <div className="my-5">
                    <div className="timer-track">
                      <div className="timer-sand" style={{ width: '74%' }} />
                    </div>
                  </div>

                  {/* Playable Row of Word / Number Tiles */}
                  <div className="my-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[oklch(50%_0.014_255)]">
                      Tap tiles to test mark:
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {demoTiles.map((tile) => {
                        const isMarked = demoMarked.includes(tile.num)
                        return (
                          <button
                            key={tile.label}
                            type="button"
                            onClick={() => {
                              setDemoMarked((prev) =>
                                prev.includes(tile.num)
                                  ? prev.filter((n) => n !== tile.num)
                                  : [...prev, tile.num]
                              )
                            }}
                            className={`tile-hallmark px-4 py-3 min-w-[70px] ${
                              isMarked ? 'tile-hallmark-marked' : 'hover:bg-white'
                            }`}
                          >
                            <span className="text-[11px] opacity-75 font-mono">{tile.letter}</span>
                            <span className="text-xl font-bold">{tile.num}</span>
                            {isMarked && (
                              <Check className="absolute top-1 right-1 size-3 text-white" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Card footer description */}
                  <div className="mt-6 pt-4 border-t border-[oklch(20%_0.014_255/8%)] flex items-center justify-between">
                    <p className="text-sm font-semibold text-[oklch(30%_0.014_255)]">
                      {demoMarked.length} of 5 tiles stamped.
                    </p>
                    <button
                      type="button"
                      onClick={() => setDemoMarked([12, 24, 38, 51, 67])}
                      className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm"
                    >
                      Stamp all
                    </button>
                  </div>

                  {/* Curled corner element */}
                  <span className="curl-corner" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Showcase Section: Real Gameplay Loop (Hallmark Hum Signature) */}
        <section id="round" className="scroll-mt-20 border-t border-[oklch(20%_0.014_255/8%)] bg-[oklch(95.5%_0.015_95)] py-20 px-6 sm:px-10">
          <div id="rules" className="scroll-mt-20 mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl">
              <div className="chip-stamp chip-coral mb-3">Authentic Multiplayer Rules</div>
              <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                How the game actually works.
              </h2>
              <p className="mt-3 text-lg text-[oklch(40%_0.014_255)]">
                From custom grid sizes (5×5 to 10×10) and pre-game swapping to live turn calling and authoritative 5-line victory.
              </p>
            </div>

            {/* Moment Tabs */}
            <div className="mb-8 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveMomentTab('rearrange')}
                className={`knob text-sm font-bold transition ${
                  activeMomentTab === 'rearrange' ? 'bg-[oklch(87%_0.175_96)] text-[oklch(20%_0.014_255)] shadow-sm' : ''
                }`}
              >
                1. Setup & Card Rearrange
              </button>
              <button
                type="button"
                onClick={() => setActiveMomentTab('ready')}
                className={`knob text-sm font-bold transition ${
                  activeMomentTab === 'ready' ? 'bg-[oklch(68%_0.21_24)] text-white shadow-sm' : ''
                }`}
              >
                2. Lobby Readiness Lock
              </button>
              <button
                type="button"
                onClick={() => setActiveMomentTab('calling')}
                className={`knob text-sm font-bold transition ${
                  activeMomentTab === 'calling' ? 'bg-[oklch(82%_0.15_152)] text-[oklch(20%_0.014_255)] shadow-sm' : ''
                }`}
              >
                3. Turn-by-Turn Calling
              </button>
              <button
                type="button"
                onClick={() => setActiveMomentTab('victory')}
                className={`knob text-sm font-bold transition ${
                  activeMomentTab === 'victory' ? 'bg-[oklch(84%_0.11_236)] text-[oklch(20%_0.014_255)] shadow-sm' : ''
                }`}
              >
                4. 5-Line BINGO Victory
              </button>
            </div>

            {/* Interactive Showcase Card */}
            <div className="card-curled-wrap max-w-5xl">
              <div className="sheet-mat" />
              <div className="card-curled p-6 sm:p-10 border border-[oklch(20%_0.014_255/10%)] shadow-xl">
                {/* 1. SETUP & REARRANGE TAB */}
                {activeMomentTab === 'rearrange' && (
                  <div className="grid gap-8 lg:grid-cols-[1.05fr_1.15fr] items-center">
                    <div>
                      <span className="chip-stamp chip-pear mb-2">Step 1 • Grid & Lucky Layout</span>
                      <h3 className="font-display text-3xl font-extrabold sm:text-4xl text-[oklch(20%_0.014_255)]">
                        Customize your lucky card
                      </h3>
                      <p className="mt-3 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        Create rooms with card sizes from <strong className="text-[oklch(20%_0.014_255)]">5×5</strong> (numbers 1–25) up to <strong className="text-[oklch(20%_0.014_255)]">10×10</strong> (numbers 1–100).
                      </p>
                      <p className="mt-2 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        In the lobby, tap any two numbers (or drag & drop) to swap their positions into your personal winning order before readying up!
                      </p>

                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="chip-stamp chip-paper">Min 5×5 (25 cells)</span>
                        <span className="chip-stamp chip-paper">Max 10×10 (100 cells)</span>
                        <span className="chip-stamp chip-mint">Tap to Swap</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-5 shadow-inner">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs uppercase font-extrabold tracking-wider text-[oklch(45%_0.014_255)]">
                          Interactive 5×5 Preview (Tap 2 tiles)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const arr = Array.from({ length: 25 }, (_, i) => i + 1)
                            for (let i = arr.length - 1; i > 0; i--) {
                              const j = Math.floor(Math.random() * (i + 1))
                              ;[arr[i], arr[j]] = [arr[j], arr[i]]
                            }
                            setDemoSwapValues(arr)
                            setDemoSelectedSwap(null)
                            setDemoSwapNotice('Card shuffled!')
                          }}
                          className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm"
                        >
                          <RotateCcw className="size-3.5" /> Shuffle
                        </button>
                      </div>

                      {/* 5x5 Tiles */}
                      <div className="grid grid-cols-5 gap-2">
                        {demoSwapValues.map((val, idx) => {
                          const isSelected = demoSelectedSwap === idx
                          return (
                            <button
                              key={`demo-swap-${idx}`}
                              type="button"
                              onClick={() => {
                                if (demoSelectedSwap === null) {
                                  setDemoSelectedSwap(idx)
                                  setDemoSwapNotice(`Selected #${val} — Now tap another tile to swap!`)
                                } else if (demoSelectedSwap === idx) {
                                  setDemoSelectedSwap(null)
                                  setDemoSwapNotice(null)
                                } else {
                                  const next = [...demoSwapValues]
                                  const prevVal = next[demoSelectedSwap]
                                  next[demoSelectedSwap] = next[idx]
                                  next[idx] = prevVal
                                  setDemoSwapValues(next)
                                  setDemoSelectedSwap(null)
                                  setDemoSwapNotice(`Swapped #${prevVal} with #${val}! ✨`)
                                }
                              }}
                              className={`tile-hallmark aspect-square text-base font-bold transition-all ${
                                isSelected ? 'tile-selected-swap scale-105' : 'bg-white hover:bg-[oklch(95%_0.015_95)]'
                              }`}
                            >
                              {val}
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[oklch(20%_0.014_255/8%)] flex items-center justify-between text-xs">
                        <span className="font-semibold text-[oklch(50%_0.014_255)]">
                          {demoSwapNotice ?? 'Tap any tile to begin swapping.'}
                        </span>
                        <span className="font-mono font-bold text-[oklch(68%_0.21_24)]">
                          🔒 Locks on Ready
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. LOBBY READINESS LOCK TAB */}
                {activeMomentTab === 'ready' && (
                  <div className="grid gap-8 lg:grid-cols-[1.05fr_1.15fr] items-center">
                    <div>
                      <span className="chip-stamp chip-coral mb-2">Step 2 • Fair Play & Lobby</span>
                      <h3 className="font-display text-3xl font-extrabold sm:text-4xl text-[oklch(20%_0.014_255)]">
                        Readiness lock & friendly reminders
                      </h3>
                      <p className="mt-3 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        Clicking <strong className="text-[oklch(20%_0.014_255)]">&ldquo;I am Ready to Play&rdquo;</strong> locks your board configuration, ensuring complete transparency and zero tampering.
                      </p>
                      <p className="mt-2 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        The Host cannot launch the game until <strong className="text-[oklch(20%_0.014_255)]">everyone is ready</strong>. If the Host starts early, a Hallmark modal alerts them and offers a 1-click nudge!
                      </p>

                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="chip-stamp chip-coral">Tamper-Proof Lock</span>
                        <span className="chip-stamp chip-mint">Authoritative Start</span>
                        <span className="chip-stamp chip-pear">Real-Time Nudge</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-5 shadow-inner space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-extrabold tracking-wider text-[oklch(45%_0.014_255)]">
                          Lobby Roster (3 Players)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDemoRohitReady((r) => !r)
                            setDemoShowUnreadyAlert(false)
                            setDemoGameLaunched(false)
                            setDemoNudgeSent(false)
                          }}
                          className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm"
                        >
                          Simulate Rohit {demoRohitReady ? 'Unready' : 'Ready'}
                        </button>
                      </div>

                      {/* Player List */}
                      <div className="space-y-2">
                        {/* Player 1 (You) */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[oklch(20%_0.014_255/8%)]">
                          <div className="flex items-center gap-2.5">
                            <span className="size-8 rounded-full bg-[oklch(68%_0.21_24)] text-white font-bold flex items-center justify-center text-xs">
                              K
                            </span>
                            <div>
                              <p className="text-sm font-bold">Kunj (You) <span className="chip-stamp chip-coral py-0.5 px-2 text-[10px]">HOST</span></p>
                              <p className="text-xs text-[oklch(50%_0.014_255)] flex items-center gap-1">
                                <LockKeyhole className="size-3 text-[oklch(68%_0.21_24)]" /> Card locked
                              </p>
                            </div>
                          </div>
                          <span className="chip-stamp chip-mint text-xs">READY</span>
                        </div>

                        {/* Player 2 */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[oklch(20%_0.014_255/8%)]">
                          <div className="flex items-center gap-2.5">
                            <span className="size-8 rounded-full bg-[oklch(87%_0.175_96)] text-[oklch(20%_0.014_255)] font-bold flex items-center justify-center text-xs">
                              P
                            </span>
                            <div>
                              <p className="text-sm font-bold">Priya</p>
                              <p className="text-xs text-[oklch(50%_0.014_255)] flex items-center gap-1">
                                <LockKeyhole className="size-3 text-[oklch(68%_0.21_24)]" /> Card locked
                              </p>
                            </div>
                          </div>
                          <span className="chip-stamp chip-mint text-xs">READY</span>
                        </div>

                        {/* Player 3 */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[oklch(20%_0.014_255/8%)]">
                          <div className="flex items-center gap-2.5">
                            <span className="size-8 rounded-full bg-[oklch(84%_0.11_236)] text-[oklch(20%_0.014_255)] font-bold flex items-center justify-center text-xs">
                              R
                            </span>
                            <div>
                              <p className="text-sm font-bold">Rohit</p>
                              <p className="text-xs text-[oklch(50%_0.014_255)]">
                                {demoRohitReady ? 'Card locked' : 'Arranging card...'}
                              </p>
                            </div>
                          </div>
                          {demoRohitReady ? (
                            <span className="chip-stamp chip-mint text-xs">READY</span>
                          ) : (
                            <span className="chip-stamp chip-paper text-xs">WAITING</span>
                          )}
                        </div>
                      </div>

                      {/* Host Start Button Action */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!demoRohitReady) {
                            setDemoShowUnreadyAlert(true)
                            setDemoGameLaunched(false)
                          } else {
                            setDemoGameLaunched(true)
                            setDemoShowUnreadyAlert(false)
                          }
                        }}
                        className="btn-hallmark btn-hallmark-coral w-full py-3 font-bold"
                      >
                        <Play className="size-4 fill-current inline-block mr-1.5" /> Start Game Now (As Host)
                      </button>

                      {/* Unready Warning Alert Modal Simulation */}
                      {demoShowUnreadyAlert && !demoRohitReady && (
                        <div className="p-4 rounded-xl border border-[oklch(68%_0.21_24/30%)] bg-[oklch(68%_0.21_24/8%)] space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2 text-sm font-bold text-[oklch(54%_0.18_24)]">
                              <Bell className="size-4 animate-bounce" /> Players Not Ready!
                            </div>
                            <button
                              type="button"
                              onClick={() => setDemoShowUnreadyAlert(false)}
                              className="text-xs font-bold text-[oklch(45%_0.014_255)]"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="text-xs text-[oklch(35%_0.014_255)]">
                            Rohit is still arranging their lucky card. You can wait or send them a friendly alert!
                          </p>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDemoNudgeSent(true)
                                setTimeout(() => setDemoNudgeSent(false), 3000)
                              }}
                              className="btn-hallmark btn-hallmark-pear btn-hallmark-sm text-xs font-bold"
                            >
                              {demoNudgeSent ? '🔔 Nudge Sent to Rohit!' : 'Send Nudge Alert 🔔'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDemoRohitReady(true)}
                              className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm text-xs font-bold"
                            >
                              Make Rohit Ready
                            </button>
                          </div>
                        </div>
                      )}

                      {demoGameLaunched && (
                        <div className="p-3 rounded-xl border border-[oklch(82%_0.15_152/40%)] bg-[oklch(82%_0.15_152/20%)] text-center text-xs font-bold text-[oklch(20%_0.014_255)]">
                          🎉 All players are ready! Authoritative 3-second countdown starting!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. LIVE TURN-BY-TURN CALLING TAB */}
                {activeMomentTab === 'calling' && (
                  <div className="grid gap-8 lg:grid-cols-[1.05fr_1.15fr] items-center">
                    <div>
                      <span className="chip-stamp chip-mint mb-2">Step 3 • Live Turn Calling</span>
                      <h3 className="font-display text-3xl font-extrabold sm:text-4xl text-[oklch(20%_0.014_255)]">
                        Turn-based calling & instant sync
                      </h3>
                      <p className="mt-3 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        No generic random caller. Players rotate turns, calling numbers <strong className="text-[oklch(20%_0.014_255)]">directly from their own cards</strong>!
                      </p>
                      <p className="mt-2 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        When you select a number on your turn, it broadcasts instantly to all players via WebSockets and marks that number in Hallmark Coral with a checkmark (<strong className="text-[oklch(68%_0.21_24)]">✓</strong>).
                      </p>

                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="chip-stamp chip-coral">Coral Stamped Tiles</span>
                        <span className="chip-stamp chip-mint">WebSocket Broadcast</span>
                        <span className="chip-stamp chip-pear">Seamless Turn Rotation</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-5 shadow-inner">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs uppercase font-extrabold tracking-wider text-[oklch(45%_0.014_255)]">
                            Current Turn: <span className="text-[oklch(68%_0.21_24)] font-black">{demoCurrentTurn}</span>
                          </p>
                          <p className="text-[11px] text-[oklch(50%_0.014_255)]">
                            {demoCurrentTurn === 'You' ? 'Click any active tile to call it aloud:' : 'Priya is choosing a number...'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDemoCalledNumbers([6, 12, 22, 5])
                            setDemoCurrentTurn('You')
                            setDemoLastCallNotice('Board reset! Your turn to call.')
                          }}
                          className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm"
                        >
                          <RotateCcw className="size-3.5" /> Reset
                        </button>
                      </div>

                      {/* 5x5 Calling Grid */}
                      <div className="grid grid-cols-5 gap-2">
                        {demoSwapValues.map((val, idx) => {
                          const isCalled = demoCalledNumbers.includes(val)
                          return (
                            <button
                              key={`demo-call-${idx}`}
                              type="button"
                              disabled={isCalled || demoCurrentTurn !== 'You'}
                              onClick={() => {
                                setDemoCalledNumbers((prev) => [...prev, val])
                                setDemoLastCallNotice(`You called #${val}! Stamped with coral seal on all cards.`)
                                setDemoCurrentTurn('Priya')
                                setTimeout(() => {
                                  setDemoCurrentTurn('You')
                                  setDemoLastCallNotice(`Priya took her turn! Back to your turn.`)
                                }, 2500)
                              }}
                              className={`tile-hallmark aspect-square text-base font-bold transition-all relative ${
                                isCalled
                                  ? 'tile-hallmark-marked text-white'
                                  : demoCurrentTurn === 'You'
                                  ? 'bg-white hover:bg-[oklch(87%_0.175_96/20%)] hover:scale-105 border-[oklch(68%_0.21_24/40%)]'
                                  : 'bg-white opacity-80 cursor-not-allowed'
                              }`}
                            >
                              {val}
                              {isCalled && (
                                <Check className="absolute top-1 right-1 size-3 text-white" />
                              )}
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[oklch(20%_0.014_255/8%)] flex items-center justify-between text-xs font-semibold">
                        <span className="text-[oklch(40%_0.014_255)]">
                          📢 {demoLastCallNotice}
                        </span>
                        <span className="font-mono text-[oklch(68%_0.21_24)]">
                          {demoCalledNumbers.length} called
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. 5-LINE BINGO VICTORY TAB */}
                {activeMomentTab === 'victory' && (
                  <div className="grid gap-8 lg:grid-cols-[1.05fr_1.15fr] items-center">
                    <div>
                      <span className="chip-stamp chip-blue mb-2">Step 4 • Victory Condition</span>
                      <h3 className="font-display text-3xl font-extrabold sm:text-4xl text-[oklch(20%_0.014_255)]">
                        Match any 5 lines to win BINGO!
                      </h3>
                      <p className="mt-3 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        Complete any <strong className="text-[oklch(20%_0.014_255)]">5 full lines</strong>—horizontal rows, vertical columns, or diagonal corners.
                      </p>
                      <p className="mt-2 text-base text-[oklch(40%_0.014_255)] leading-relaxed">
                        The central game engine authoritatively evaluates line completions in real time. The first player to complete 5 lines triggers the celebratory podium!
                      </p>

                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="chip-stamp chip-pear">Rows & Columns</span>
                        <span className="chip-stamp chip-coral">Diagonal Corners</span>
                        <span className="chip-stamp chip-mint">Authoritative Win</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-5 shadow-inner space-y-4">
                      {/* B-I-N-G-O Letters Indicator */}
                      <div className="flex items-center justify-between gap-1.5 p-2 rounded-xl bg-white border border-[oklch(20%_0.014_255/8%)]">
                        {['B', 'I', 'N', 'G', 'O'].map((letter, idx) => {
                          const isComplete = idx < 4 || demoHasWon
                          return (
                            <div
                              key={`bingo-letter-${letter}`}
                              className={`flex-1 py-1.5 text-center font-display text-sm font-black rounded-lg transition-all ${
                                isComplete
                                  ? 'bg-[oklch(68%_0.21_24)] text-white shadow-xs scale-102'
                                  : 'bg-[oklch(92%_0.02_95)] text-[oklch(45%_0.014_255)]'
                              }`}
                            >
                              {letter}
                              <span className="block text-[9px] font-mono font-normal">
                                {isComplete ? 'Line ✓' : 'Needed'}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      {/* 5x5 Board with 4 lines done, cell 21 needed */}
                      <div className="grid grid-cols-5 gap-2">
                        {demoSwapValues.map((val, idx) => {
                          const isMarked = demoWinMarked.includes(val) || (demoHasWon && val === 21)
                          const isTargetCell = val === 21 && !demoHasWon
                          return (
                            <button
                              key={`demo-win-${idx}`}
                              type="button"
                              onClick={() => {
                                if (val === 21) {
                                  setDemoHasWon(true)
                                  confetti({ particleCount: 50, spread: 60 })
                                }
                              }}
                              className={`tile-hallmark aspect-square text-base font-bold transition-all relative ${
                                isMarked
                                  ? 'tile-hallmark-marked text-white'
                                  : isTargetCell
                                  ? 'bg-[oklch(87%_0.175_96/35%)] border-2 border-dashed border-[oklch(68%_0.21_24)] animate-pulse hover:scale-105'
                                  : 'bg-white opacity-70'
                              }`}
                            >
                              {val}
                              {isMarked && (
                                <Check className="absolute top-1 right-1 size-3 text-white" />
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Status / Victory Message */}
                      {demoHasWon ? (
                        <div className="p-4 rounded-xl border border-[oklch(68%_0.21_24/40%)] bg-white text-center space-y-2 shadow-sm">
                          <Trophy className="mx-auto size-10 text-[oklch(68%_0.21_24)] animate-bounce" />
                          <p className="font-display text-2xl font-black text-[oklch(20%_0.014_255)]">
                            🎉 B-I-N-G-O! 5 Lines Completed!
                          </p>
                          <p className="text-xs text-[oklch(40%_0.014_255)]">
                            Verified by server: 2 Rows, 2 Columns, and 1 Diagonal matched!
                          </p>
                          <button
                            type="button"
                            onClick={() => setDemoHasWon(false)}
                            className="btn-hallmark btn-hallmark-secondary btn-hallmark-sm text-xs font-bold"
                          >
                            Reset Demo
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-white border border-[oklch(20%_0.014_255/8%)] flex items-center justify-between text-xs">
                          <span className="font-bold text-[oklch(30%_0.014_255)]">
                            4 of 5 Lines Complete!
                          </span>
                          <span className="font-bold text-[oklch(68%_0.21_24)]">
                            👉 Tap tile #21 to trigger BINGO!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Hallmark Curled Corner */}
                <span className="curl-corner" aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>

        {/* Room Launch Form (Create / Join Card) */}
        <section id="play-card" className="scroll-mt-20 mx-auto max-w-xl px-6 py-20">
          <div className="card-curled-wrap">
            <div className="sheet-mat" />
            <div className="card-curled p-8 sm:p-10 border border-[oklch(20%_0.014_255/10%)] shadow-xl">
              {/* Toggle knobs */}
              <div className="mb-8 flex gap-2 rounded-2xl bg-[oklch(94.8%_0.018_95)] p-1.5">
                <button
                  type="button"
                  onClick={() => setMode('create')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition ${
                    mode === 'create'
                      ? 'bg-[#ffffff] text-[oklch(20%_0.014_255)] shadow-sm'
                      : 'text-[oklch(45%_0.014_255)] hover:text-[oklch(20%_0.014_255)]'
                  }`}
                >
                  Create a room
                </button>
                <button
                  type="button"
                  onClick={() => setMode('join')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition ${
                    mode === 'join'
                      ? 'bg-[#ffffff] text-[oklch(20%_0.014_255)] shadow-sm'
                      : 'text-[oklch(45%_0.014_255)] hover:text-[oklch(20%_0.014_255)]'
                  }`}
                >
                  Join existing room
                </button>
              </div>

              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold">
                  {mode === 'create' ? 'Host a game session' : 'Enter room code'}
                </h2>
                <p className="mt-1 text-sm text-[oklch(45%_0.014_255)]">
                  {mode === 'create'
                    ? 'Pick your rules and get an instant shareable 6-letter room code.'
                    : 'Paste the code provided by your game host.'}
                </p>
              </div>

              <div className="space-y-5">
                {/* Enter Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[oklch(45%_0.014_255)] mb-2">
                    Enter Name
                  </label>
                  <input
                    id="player-name-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={32}
                    className="h-13 w-full rounded-2xl border border-[oklch(20%_0.014_255/12%)] bg-white px-4 text-base font-semibold text-[oklch(20%_0.014_255)] outline-none transition focus:border-[oklch(68%_0.21_24)] focus:ring-4 focus:ring-[oklch(68%_0.21_24/15%)]"
                  />
                </div>

                {mode === 'create' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="card-size-input" className="block text-xs font-bold uppercase tracking-wider text-[oklch(45%_0.014_255)]">
                        Card Grid Size (N × N)
                      </label>
                      <span className="font-mono text-xs font-bold text-[oklch(68%_0.21_24)] bg-[oklch(68%_0.21_24/10%)] px-2.5 py-0.5 rounded-full">
                        Min 5×5 — Max 10×10
                      </span>
                    </div>
                    <input
                      id="card-size-input"
                      type="number"
                      min={5}
                      max={10}
                      value={cardSizeN}
                      onChange={(e) => setCardSizeN(e.target.value)}
                      placeholder="Enter grid size (5 to 10, default 5)"
                      className="h-13 w-full rounded-2xl border border-[oklch(20%_0.014_255/12%)] bg-white px-4 font-mono text-base font-semibold text-[oklch(20%_0.014_255)] outline-none transition focus:border-[oklch(68%_0.21_24)] focus:ring-4 focus:ring-[oklch(68%_0.21_24/15%)]"
                    />
                    <p className="mt-2 text-xs text-[oklch(50%_0.014_255)]">
                      {Number(cardSizeN) >= 5 && Number(cardSizeN) <= 10
                        ? `Generates a ${cardSizeN}×${cardSizeN} card containing numbers from 1 to ${Number(cardSizeN) * Number(cardSizeN)}.`
                        : 'Allowed range is 5 (5×5, 25 numbers) up to 10 (10×10, 100 numbers).'}
                    </p>
                  </div>
                )}

                {mode === 'join' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[oklch(45%_0.014_255)] mb-2">
                      6-Character Room Code
                    </label>
                    <input
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                      placeholder="E.G. N7Q4K2"
                      maxLength={6}
                      className="h-13 w-full rounded-2xl border border-[oklch(20%_0.014_255/12%)] bg-white px-4 font-mono text-base font-bold tracking-[0.25em] text-[oklch(20%_0.014_255)] uppercase outline-none focus:border-[oklch(68%_0.21_24)] focus:ring-4 focus:ring-[oklch(68%_0.21_24/15%)]"
                    />
                  </div>
                )}

                <Button
                  onClick={mode === 'create' ? handleCreateRoom : handleJoinRoom}
                  disabled={loading}
                  variant="coral"
                  size="lg"
                  className="w-full h-14 mt-2"
                >
                  {loading ? 'Connecting...' : mode === 'create' ? 'Create room' : 'Join room'}{' '}
                  <ArrowRight className="size-5" />
                </Button>
              </div>

              <span className="curl-corner" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[oklch(20%_0.014_255/8%)] bg-[oklch(95.5%_0.015_95)] py-12 px-6 sm:px-10 text-center">
          <div className="flex justify-center mb-3">
            <DingooLogo size="md" />
          </div>
          <p className="mt-2 text-xs text-[oklch(50%_0.014_255)]">
            A tactile, real-time multiplayer Bingo game with physical cut-paper cards and instant authoritative sync.
          </p>
          <p className="mt-2 text-[11px] font-mono text-[oklch(55%_0.014_255)]">
            Live on <a href="https://dingoo.vercel.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-[oklch(20%_0.014_255)] font-bold">dingoo.vercel.app</a>
          </p>
        </footer>
      </main>
    )
  }

  // ----------------------------------------------------
  // SCREEN 2: LOBBY (Waiting Room & Rearrangement)
  // ----------------------------------------------------
  if (screen === 'lobby' && room) {
    return (
      <main className="min-h-screen text-[oklch(20%_0.014_255)]">
        {renderToast()}

        {/* Countdown Overlay with Physical Bouncing Numbers */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(20%_0.014_255/65%)] backdrop-blur-sm animate-in fade-in">
            <div className="card-curled p-10 text-center max-w-sm w-full mx-4 border border-[oklch(20%_0.014_255/15%)] shadow-2xl">
              <span className="chip-stamp chip-coral mb-3">Starting Round</span>
              <h2 className="font-display text-3xl font-bold">Get ready!</h2>
              <div className="my-6 font-mono text-8xl font-black text-[oklch(68%_0.21_24)] animate-bounce">
                {countdown}
              </div>
              <p className="text-xs font-semibold text-[oklch(50%_0.014_255)]">
                Syncing initial cards with all players...
              </p>
              <span className="curl-corner" aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Nav Header */}
        <header className="bar-torn">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
            <button
              onClick={handleLeaveRoom}
              className="flex items-center no-underline cursor-pointer"
            >
              <DingooLogo size="sm" />
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className="chip-stamp chip-paper cursor-pointer hover:bg-[oklch(93%_0.02_95)] active:scale-95 transition-all flex items-center gap-2 select-none group"
                title="Click to copy Room Code"
              >
                <span>Room</span>
                <strong className="font-mono text-sm tracking-wider text-[oklch(68%_0.21_24)]">{room.code}</strong>
                {copied ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[oklch(50%_0.13_155)] animate-in fade-in">
                    <Check className="size-3.5" />
                    <span>Copied!</span>
                  </span>
                ) : (
                  <Copy className="size-3.5 text-[oklch(50%_0.014_255)] group-hover:text-[oklch(20%_0.014_255)] transition-colors" />
                )}
              </button>
              <Button onClick={handleLeaveRoom} variant="ghost" size="sm">
                Leave
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left: Rearrangeable Card */}
            <div>
              <div className="mb-4">
                <h1 className="font-display text-3xl font-extrabold sm:text-4xl text-[oklch(20%_0.014_255)]">
                  Game Lobby
                </h1>
                <p className="mt-1 text-sm text-[oklch(45%_0.014_255)]">
                  {currentPlayer?.ready
                    ? 'Your card is locked in. Waiting for other players to get ready.'
                    : 'Drag & drop or tap any two numbers to customize your lucky layout before getting ready.'}
                </p>
              </div>

              {/* Card preview with swap functionality */}
              {playerCard && (
                <div className="card-curled p-6 border border-[oklch(20%_0.014_255/10%)] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[oklch(20%_0.014_255/8%)]">
                    <div>
                      <span className="text-sm font-bold tracking-tight text-[oklch(20%_0.014_255)] block">
                        Bingo Card ({playerCard.size}×{playerCard.size})
                      </span>
                      <span className="text-[11px] font-mono text-[oklch(50%_0.014_255)]">
                        Numbers 1 to {room.rangeMax}
                      </span>
                    </div>
                    {currentPlayer?.ready ? (
                      <span className="chip-stamp chip-mint text-xs">
                        <Check className="size-3.5" /> Card Locked • Ready
                      </span>
                    ) : (
                      <span className="chip-stamp chip-coral text-xs">
                        <ArrowUpDown className="size-3.5" /> Drag or tap numbers to swap
                      </span>
                    )}
                  </div>

                  {/* Active swap selection banner */}
                  {!currentPlayer?.ready && selectedSwapIdx !== null && (
                    <div className="mb-3 px-3.5 py-2 rounded-xl bg-[oklch(96%_0.04_24)] border border-[oklch(68%_0.21_24/25%)] flex items-center justify-between text-xs font-bold text-[oklch(68%_0.21_24)] animate-in fade-in">
                      <span className="flex items-center gap-1.5">
                        <ArrowUpDown className="size-3.5" />
                        Selected [ {playerCard.values[selectedSwapIdx]} ] — drag onto another cell or tap to swap
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedSwapIdx(null)}
                        className="text-[11px] font-bold underline hover:opacity-80 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Dynamic Column Headers */}
                  <div
                    className="grid gap-2 mb-2"
                    style={{ gridTemplateColumns: `repeat(${playerCard.size}, minmax(0, 1fr))` }}
                  >
                    {getColumnHeaders(playerCard.size).map((colLabel, colIdx) => {
                      const theme = getColumnTheme(colIdx, playerCard.size)
                      return (
                        <div
                          key={`lobby-header-${colLabel}-${colIdx}`}
                          className={`py-1 text-center font-display text-xs font-extrabold rounded-lg ${theme.bg} ${theme.text} shadow-xs`}
                        >
                          {colLabel}
                        </div>
                      )
                    })}
                  </div>

                  {/* N x N Dynamic Grid */}
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${playerCard.size}, minmax(0, 1fr))` }}
                  >
                    {playerCard.values.map((val, idx) => {
                      const isFree = val === 0
                      const isSelected = selectedSwapIdx === idx
                      const isDraggingThis = draggedIdx === idx
                      const isDragOverThis = dragOverIdx === idx && !isFree
                      const isJustSwapped =
                        lastSwappedPair !== null && (lastSwappedPair[0] === idx || lastSwappedPair[1] === idx)
                      const isLocked = Boolean(currentPlayer?.ready)

                      return (
                        <button
                          key={`rearrange-${idx}`}
                          type="button"
                          data-cell-idx={idx}
                          onClick={() => handleSwapCardCells(idx)}
                          disabled={isLocked || isFree}
                          draggable={!isLocked && !isFree}
                          onDragStart={(e) => {
                            if (isLocked || isFree) {
                              e.preventDefault()
                              return
                            }
                            e.dataTransfer.setData('text/plain', String(idx))
                            e.dataTransfer.effectAllowed = 'move'
                            setDraggedIdx(idx)
                          }}
                          onDragOver={(e) => {
                            if (isLocked || isFree) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (dragOverIdx !== idx) {
                              setDragOverIdx(idx)
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverIdx === idx) {
                              setDragOverIdx(null)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (isLocked || isFree) return
                            const sourceIdx = draggedIdx ?? Number(e.dataTransfer.getData('text/plain'))
                            if (!isNaN(sourceIdx) && sourceIdx !== idx) {
                              performSwap(sourceIdx, idx)
                            }
                            setDraggedIdx(null)
                            setDragOverIdx(null)
                          }}
                          onDragEnd={() => {
                            setDraggedIdx(null)
                            setDragOverIdx(null)
                          }}
                          onTouchStart={() => {
                            if (isLocked || isFree) return
                            touchStartIdx.current = idx
                          }}
                          onTouchMove={(e) => {
                            if (touchStartIdx.current === null || isLocked) return
                            const touch = e.touches[0]
                            const targetElem = document.elementFromPoint(touch.clientX, touch.clientY)
                            const cellElem = targetElem?.closest('[data-cell-idx]')
                            if (cellElem) {
                              const targetIdx = Number(cellElem.getAttribute('data-cell-idx'))
                              if (!isNaN(targetIdx) && targetIdx !== dragOverIdx && playerCard.values[targetIdx] !== 0) {
                                setDragOverIdx(targetIdx)
                              }
                            }
                          }}
                          onTouchEnd={() => {
                            if (
                              touchStartIdx.current !== null &&
                              dragOverIdx !== null &&
                              touchStartIdx.current !== dragOverIdx
                            ) {
                              performSwap(touchStartIdx.current, dragOverIdx)
                            }
                            touchStartIdx.current = null
                            setDragOverIdx(null)
                          }}
                          style={{
                            viewTransitionName: isFree ? undefined : `bingo-tile-${val}`,
                          }}
                          className={`tile-hallmark aspect-square text-base font-bold transition-all ${
                            isFree
                              ? 'tile-hallmark-pear cursor-default'
                              : isDraggingThis
                              ? 'tile-dragging'
                              : isDragOverThis
                              ? 'tile-drag-over'
                              : isSelected
                              ? 'tile-hallmark-coral scale-105 z-10 ring-2 ring-[oklch(68%_0.21_24)]'
                              : isJustSwapped
                              ? 'tile-swapped-snap z-10'
                              : isLocked
                              ? 'bg-white opacity-80 cursor-not-allowed shadow-xs'
                              : 'bg-white tile-draggable hover:scale-105'
                          }`}
                        >
                          {isFree ? (
                            <div className="flex flex-col items-center">
                              <Star className="size-3 text-[oklch(20%_0.014_255)] fill-current" />
                              <span className="text-[10px] tracking-wider font-extrabold">FREE</span>
                            </div>
                          ) : (
                            val
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {currentPlayer?.ready && (
                    <p className="mt-3 text-center text-xs text-[oklch(50%_0.014_255)] font-semibold">
                      🔒 Card locked. Click &ldquo;Unlock Card to Rearrange&rdquo; in the right panel to make changes.
                    </p>
                  )}

                  <span className="curl-corner" aria-hidden="true" />
                </div>
              )}
            </div>

            {/* Right: Roster & Controls */}
            <div>
              <div className="card-curled p-6 sm:p-7 border border-[oklch(20%_0.014_255/10%)] shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-[oklch(20%_0.014_255/8%)]">
                  <div>
                    <h2 className="font-display text-xl font-bold">
                      Players{' '}
                      <span className="text-[oklch(55%_0.014_255)] font-mono text-base font-normal">
                        ({room.players.length}/{room.maxPlayers})
                      </span>
                    </h2>
                  </div>
                  <span
                    className={`chip-stamp text-xs ${
                      room.players.every((p) => p.ready) ? 'chip-mint' : 'chip-paper'
                    }`}
                  >
                    {room.players.filter((p) => p.ready).length}/{room.players.length} Ready
                  </span>
                </div>

                {/* Player List */}
                <div className="my-5 space-y-2.5">
                  {room.players.map((p, idx) => {
                    const isHostPlayer = p.id === room.hostPlayerId
                    const isMe = p.id === playerId
                    const chipStyle = PLAYER_CHIP_COLORS[idx % PLAYER_CHIP_COLORS.length]

                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-2xl border border-[oklch(20%_0.014_255/8%)] bg-[oklch(97.4%_0.012_95)] px-3.5 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`grid size-9 place-items-center rounded-xl font-display font-extrabold ${chipStyle}`}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[oklch(20%_0.014_255)]">
                              {p.name} {isMe && '(You)'}
                            </span>
                            {isHostPlayer && (
                              <span className="chip-stamp chip-coral text-[10px] py-0 px-2 min-h-[20px]">
                                Host
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {p.ready ? (
                            <span className="chip-stamp chip-mint text-[11px] gap-1">
                              <Check className="size-3" /> Ready
                            </span>
                          ) : (
                            <span className="chip-stamp chip-paper text-[11px]">
                              Waiting
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleToggleReady}
                    variant={currentPlayer?.ready ? 'secondary' : 'mint'}
                    size="lg"
                    className="w-full text-base font-bold shadow-xs"
                  >
                    {currentPlayer?.ready ? (
                      <>
                        <ArrowUpDown className="size-4 text-[oklch(68%_0.21_24)]" /> Unlock Card to Rearrange
                      </>
                    ) : (
                      <>
                        <Check className="size-5" /> I am Ready to Play
                      </>
                    )}
                  </Button>

                  {isHost && (
                    <Button
                      onClick={handleHostStart}
                      variant="coral"
                      size="lg"
                      className="w-full text-base font-bold shadow-md"
                    >
                      <Play className="size-5" /> Start Game Now
                    </Button>
                  )}
                </div>

                <span className="curl-corner" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        {/* Not Ready Players PopUp Modal */}
        {showNotReadyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(20%_0.014_255/50%)] backdrop-blur-xs p-4 animate-in fade-in">
            <div className="card-curled-wrap max-w-md w-full">
              <div className="sheet-mat" />
              <div className="card-curled p-7 sm:p-8 border border-[oklch(20%_0.014_255/12%)] shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => setShowNotReadyModal(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[oklch(20%_0.014_255/8%)] text-[oklch(40%_0.014_255)] transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>

                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[oklch(87%_0.175_96)] text-[oklch(20%_0.014_255)] shadow-xs">
                  <Clock className="size-7 text-[oklch(68%_0.21_24)]" />
                </div>

                <div className="text-center mb-5">
                  <h3 className="font-display text-2xl font-bold text-[oklch(20%_0.014_255)]">
                    Players Not Ready!
                  </h3>
                  <p className="text-sm text-[oklch(45%_0.014_255)] mt-1.5">
                    Game cannot start until all players are ready to play.
                  </p>
                </div>

                {/* List of Unready Players */}
                <div className="mb-6 rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-4 space-y-2.5 max-h-52 overflow-y-auto">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[oklch(50%_0.014_255)] mb-1">
                    Waiting for players to get ready:
                  </p>
                  {room.players
                    .filter((p) => p.connected && !p.ready)
                    .map((p) => {
                      const isMe = p.id === playerId
                      return (
                        <div
                          key={`unready-${p.id}`}
                          className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 border border-[oklch(20%_0.014_255/8%)] shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="grid size-7 place-items-center rounded-lg bg-[oklch(87%_0.175_96)] font-display text-xs font-bold text-[oklch(20%_0.014_255)]">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-sm text-[oklch(20%_0.014_255)]">
                              {p.name} {isMe && <span className="text-[oklch(68%_0.21_24)]">(You)</span>}
                            </span>
                          </div>
                          <span className="chip-stamp chip-coral text-[10px]">
                            Not Ready
                          </span>
                        </div>
                      )
                    })}
                </div>

                {/* Action buttons */}
                <div className="space-y-2.5">
                  {isHost && !currentPlayer?.ready ? (
                    <Button
                      onClick={() => {
                        handleToggleReady()
                        setShowNotReadyModal(false)
                      }}
                      variant="mint"
                      size="lg"
                      className="w-full font-bold"
                    >
                      <Check className="size-4" /> Ready Up Myself & Continue
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        handleSendNudge()
                        setShowNotReadyModal(false)
                      }}
                      variant="coral"
                      size="lg"
                      className="w-full font-bold"
                    >
                      <Volume2 className="size-4" /> Remind Players to Get Ready
                    </Button>
                  )}

                  <Button
                    onClick={() => setShowNotReadyModal(false)}
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                  >
                    Close
                  </Button>
                </div>

                <span className="curl-corner" aria-hidden="true" />
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  // ----------------------------------------------------
  // SCREEN 3: GAMEPLAY (Active Bingo Board)
  // ----------------------------------------------------
  if (screen === 'game' && room && playerCard) {
    const markedSet = new Set(playerCard.marked || [])
    const calledSet = new Set(calledNumbers)
    const activeTurnPlayer = room.players.find((p) => p.id === room.currentPlayerId)

    return (
      <main className="min-h-screen text-[oklch(20%_0.014_255)] pb-16">
        {renderToast()}

        {/* Top Header */}
        <header className="bar-torn">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
            <button
              onClick={handleLeaveRoom}
              className="flex items-center cursor-pointer"
            >
              <DingooLogo size="sm" />
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className="chip-stamp chip-paper cursor-pointer hover:bg-[oklch(93%_0.02_95)] active:scale-95 transition-all flex items-center gap-1.5 select-none group"
                title="Click to copy Room Code"
              >
                <span className="text-xs">Room</span>
                <strong className="font-mono text-sm tracking-wider text-[oklch(68%_0.21_24)]">
                  {room.code}
                </strong>
                {copied ? (
                  <Check className="size-3.5 text-[oklch(50%_0.13_155)]" />
                ) : (
                  <Copy className="size-3.5 text-[oklch(50%_0.014_255)] group-hover:text-[oklch(20%_0.014_255)] transition-colors" />
                )}
              </button>
              <span className="knob text-xs">
                Turn <strong className="font-mono text-sm ml-1">{room.turnNumber}</strong>
              </span>
              <span className="chip-stamp chip-mint text-[11px] hidden sm:inline-flex">
                <Users className="size-3.5" />
                {room.players.filter((p) => p.connected).length} live
              </span>
              <Button onClick={handleLeaveRoom} variant="ghost" size="sm">
                Exit
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 py-8 sm:px-10">
          {/* Active Turn Announcement Banner */}
          <div
            className={`mb-8 p-4 rounded-2xl border transition flex flex-wrap items-center justify-between gap-3 ${
              isMyTurn
                ? 'bg-[oklch(87%_0.175_96)] border-[oklch(72%_0.16_92)] shadow-sm'
                : 'bg-white border-[oklch(20%_0.014_255/10%)]'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`grid size-9 place-items-center rounded-xl font-bold ${isMyTurn ? 'bg-[oklch(68%_0.21_24)] text-white' : 'bg-[oklch(94.8%_0.018_95)] text-[oklch(20%_0.014_255)]'}`}>
                {isMyTurn ? '🎯' : '⏳'}
              </span>
              <div>
                <p className="font-display font-extrabold text-base sm:text-lg">
                  {isMyTurn
                    ? "It's your turn! Tap any unmarked cell on your board."
                    : `Waiting for ${activeTurnPlayer?.name || 'next player'} to make a call...`}
                </p>
                <p className="text-xs text-[oklch(45%_0.014_255)]">
                  Condition: {room.winningCondition === 'FIVE_LINES' ? '5 Lines (Classic)' : room.winningCondition}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`chip-stamp font-mono text-xs font-black transition-all ${
                turnSecondsRemaining <= 10 ? 'chip-coral animate-pulse' : 'chip-paper'
              }`}>
                ⏳ {turnSecondsRemaining}s left
              </span>
              <span className="chip-stamp chip-paper font-mono text-xs hidden sm:inline-flex">
                {calledNumbers.length} called
              </span>
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.15fr_380px]">
            {/* Left Bingo Card Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="chip-stamp chip-coral mb-1 text-[10px]">Authoritative Grid</span>
                  <h2 className="font-display text-3xl font-extrabold tracking-tight">Your Bingo Card</h2>
                </div>

                <div className="flex items-center gap-3">
                  <div className="knob">
                    <span className="text-xs uppercase text-[oklch(50%_0.014_255)]">Lines:</span>
                    <strong className="font-mono text-base text-[oklch(68%_0.21_24)]">
                      {currentPlayer?.completedLines || 0}
                    </strong>
                  </div>
                  <div className="knob">
                    <span className="text-xs uppercase text-[oklch(50%_0.014_255)]">Score:</span>
                    <strong className="font-mono text-base text-[oklch(50%_0.13_155)]">
                      {currentPlayer?.score || 0}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 5 Complete Lines Hallmark Stamp Tracker */}
              <div className="mb-6 rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-4 sm:p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[oklch(40%_0.014_255)]">
                      5 Lines Goal Progress:
                    </span>
                    <span className="chip-stamp chip-coral text-[10px]">
                      {Math.min(currentPlayer?.completedLines || 0, 5)} / 5 Complete
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[oklch(50%_0.014_255)]">
                    Horizontal, Vertical, or Diagonal
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {['B', 'I', 'N', 'G', 'O'].map((letter, idx) => {
                    const isAchieved = (currentPlayer?.completedLines || 0) > idx
                    const theme = getLetterTheme(letter)
                    return (
                      <div
                        key={`line-tracker-${letter}-${idx}`}
                        className={`flex flex-col items-center justify-center py-2.5 sm:py-3 rounded-xl border transition-all duration-300 ${
                          isAchieved
                            ? `${theme.bg} text-white shadow-sm scale-[1.02] border-transparent font-black`
                            : 'border-dashed border-[oklch(20%_0.014_255/20%)] bg-white/70 text-[oklch(45%_0.014_255)]'
                        }`}
                      >
                        <span className="text-lg font-display font-extrabold">{letter}</span>
                        <span className="text-[10px] tracking-tight opacity-85 uppercase font-semibold">
                          {isAchieved ? `Line ${idx + 1} ✓` : `Line ${idx + 1}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bingo Card Container */}
              <div className="card-curled-wrap">
                <div className="sheet-mat" />
                <div className="card-curled p-6 sm:p-8 border border-[oklch(20%_0.014_255/12%)] shadow-md">
                  {/* Dynamic Column Headers */}
                  <div
                    className="grid gap-2.5 mb-3"
                    style={{ gridTemplateColumns: `repeat(${playerCard.size}, minmax(0, 1fr))` }}
                  >
                    {getColumnHeaders(playerCard.size).map((colLabel, colIdx) => {
                      const theme = getColumnTheme(colIdx, playerCard.size)
                      return (
                        <div
                          key={`game-header-${colLabel}-${colIdx}`}
                          className={`py-2 text-center font-display text-xl font-extrabold rounded-xl ${theme.bg} ${theme.text} shadow-sm`}
                        >
                          {colLabel}
                        </div>
                      )
                    })}
                  </div>

                  {/* N x N Dynamic Grid */}
                  <div
                    className="grid gap-2.5"
                    style={{ gridTemplateColumns: `repeat(${playerCard.size}, minmax(0, 1fr))` }}
                  >
                    {playerCard.values.map((value, index) => {
                      const isFree = value === 0
                      const isMarked = isFree || markedSet.has(value) || calledSet.has(value)

                      return (
                        <button
                          key={`game-cell-${value}-${index}`}
                          type="button"
                          onClick={() => handleSelectCardNumber(value)}
                          disabled={!isMyTurn || isMarked}
                          className={`tile-hallmark aspect-square text-lg sm:text-2xl font-black ${
                            isFree
                              ? 'tile-hallmark-pear'
                              : isMarked
                              ? 'tile-hallmark-marked'
                              : isMyTurn
                              ? 'bg-white hover:bg-[oklch(87%_0.175_96/25%)] border-[oklch(68%_0.21_24)] cursor-pointer hover:scale-105 active:scale-95'
                              : 'bg-white cursor-not-allowed opacity-90'
                          }`}
                        >
                          {isFree ? (
                            <div className="flex flex-col items-center">
                              <Star className="size-4 sm:size-5 fill-current" />
                              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">FREE</span>
                            </div>
                          ) : (
                            value
                          )}
                          {isMarked && (
                            <Check className="absolute top-1.5 right-1.5 size-4 text-white" />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <span className="curl-corner" aria-hidden="true" />
                </div>
              </div>

              {/* Claim BINGO Action Bar */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-[oklch(94.8%_0.018_95)] border border-[oklch(20%_0.014_255/8%)]">
                <div className="flex items-center gap-4 text-xs font-semibold text-[oklch(45%_0.014_255)]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3.5 rounded-md bg-[oklch(68%_0.21_24)]" /> Marked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3.5 rounded-md bg-white border border-[oklch(20%_0.014_255/15%)]" /> Unmarked
                  </span>
                </div>

                <Button
                  onClick={handleClaimBingo}
                  variant="mint"
                  size="lg"
                  className="px-8 shadow-lg"
                >
                  <Trophy className="size-5" /> Claim BINGO!
                </Button>
              </div>
            </div>

            {/* Right Aside: Ball Caller & Scoreboard */}
            <aside className="space-y-6">
              {/* Last Called Ball & Turn Status Card */}
              <div className="card-curled p-6 border border-[oklch(20%_0.014_255/10%)] shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[oklch(20%_0.014_255/8%)]">
                  <span className="chip-stamp chip-coral text-[10px]">Now Calling</span>
                  <Radio className="size-4 text-[oklch(68%_0.21_24)] animate-pulse" />
                </div>

                <div className="my-6 text-center">
                  <p className="font-mono text-5xl sm:text-6xl font-black text-[oklch(68%_0.21_24)] tracking-tight">
                    {calledNumbers.length > 0
                      ? getBallLabel(calledNumbers[0], room.rangeMax, room.cardSize)
                      : 'Waiting...'}
                  </p>
                  <p className="mt-1 text-xs text-[oklch(50%_0.014_255)] font-mono">
                    {calledNumbers.length} of {room.rangeMax - room.rangeMin + 1} numbers called (1 to {room.rangeMax})
                  </p>
                </div>

                {isMyTurn ? (
                  <div className="rounded-2xl border border-[oklch(68%_0.21_24/30%)] bg-[oklch(96%_0.04_24)] p-4 text-center shadow-2xs animate-in fade-in">
                    <p className="font-display font-black text-sm text-[oklch(68%_0.21_24)] flex items-center justify-center gap-1.5">
                      <span>🎯</span> Your Turn!
                    </p>
                    <p className="text-xs text-[oklch(40%_0.014_255)] mt-1 font-medium">
                      Tap any unmarked number on your card to call it
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[oklch(20%_0.014_255/8%)] bg-[oklch(97.4%_0.012_95)] p-4 text-center">
                    <p className="font-display font-bold text-sm text-[oklch(35%_0.014_255)] flex items-center justify-center gap-1.5">
                      <span>⏳</span> Waiting for Turn
                    </p>
                    <p className="text-xs text-[oklch(50%_0.014_255)] mt-1">
                      Waiting for <strong className="text-[oklch(20%_0.014_255)]">{activeTurnPlayer?.name || 'player'}</strong> to pick a number
                    </p>
                  </div>
                )}

                {/* 40-Second Turn Countdown Timer */}
                <div className="mt-4 pt-4 border-t border-[oklch(20%_0.014_255/8%)]">
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="font-bold flex items-center gap-1.5 text-[oklch(40%_0.014_255)]">
                      <Clock className="size-3.5 text-[oklch(68%_0.21_24)]" /> Turn Timer (40s limit)
                    </span>
                    <span className={`font-mono font-black text-xs ${turnSecondsRemaining <= 10 ? 'text-[oklch(68%_0.21_24)] animate-pulse' : 'text-[oklch(20%_0.014_255)]'}`}>
                      {turnSecondsRemaining}s left
                    </span>
                  </div>
                  <div className="w-full bg-[oklch(92%_0.015_95)] rounded-full h-2 overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        turnSecondsRemaining <= 10
                          ? 'bg-[oklch(68%_0.21_24)] animate-pulse'
                          : isMyTurn
                          ? 'bg-[oklch(68%_0.21_24)]'
                          : 'bg-[oklch(82%_0.15_152)]'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, (turnSecondsRemaining / 40) * 100))}%` }}
                    />
                  </div>
                  {turnSecondsRemaining <= 10 && (
                    <p className="text-[11px] font-bold text-[oklch(68%_0.21_24)] text-center mt-1.5 animate-pulse">
                      ⚠️ 40s limit! Turn auto-skips in {turnSecondsRemaining}s
                    </p>
                  )}
                </div>

                <span className="curl-corner" aria-hidden="true" />
              </div>

              {/* Calling History Grid */}
              <div className="card-curled p-6 border border-[oklch(20%_0.014_255/10%)] shadow-sm">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[oklch(20%_0.014_255/8%)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[oklch(45%_0.014_255)]">
                    Call History
                  </span>
                  <span className="font-mono text-xs font-bold text-[oklch(68%_0.21_24)]">
                    {calledNumbers.length}
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {calledNumbers.map((num, idx) => (
                    <div
                      key={`hist-${num}-${idx}`}
                      className={`grid aspect-square place-items-center rounded-xl font-mono text-xs font-extrabold ${
                        idx === 0
                          ? 'bg-[oklch(68%_0.21_24)] text-white shadow-sm'
                          : 'bg-[oklch(94.8%_0.018_95)] text-[oklch(20%_0.014_255)]'
                      }`}
                    >
                      {num}
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Players Scoreboard */}
              <div className="card-curled p-6 border border-[oklch(20%_0.014_255/10%)] shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-[oklch(20%_0.014_255/8%)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[oklch(45%_0.014_255)]">
                    Live Scoreboard
                  </span>
                  <Medal className="size-4 text-[oklch(87%_0.175_96)]" />
                </div>

                <div className="space-y-2.5">
                  {room.players.map((p, idx) => {
                    const isTurn = p.id === room.currentPlayerId
                    const isMe = p.id === playerId
                    const chipStyle = PLAYER_CHIP_COLORS[idx % PLAYER_CHIP_COLORS.length]

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                          isTurn
                            ? 'bg-[oklch(87%_0.175_96/25%)] border-[oklch(87%_0.175_96)]'
                            : 'bg-white border-[oklch(20%_0.014_255/6%)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`grid size-6 place-items-center rounded-lg text-[10px] font-bold ${chipStyle}`}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-[oklch(20%_0.014_255)]">
                            {p.name} {isMe && '(You)'}
                          </span>
                          {p.id === room.hostPlayerId && <Crown className="size-3 text-[oklch(87%_0.175_96)]" />}
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono font-bold">
                          <span className="text-[oklch(50%_0.13_155)]">{p.completedLines}L</span>
                          <span className="text-[oklch(20%_0.014_255/20%)]">|</span>
                          <span>{p.score}pts</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    )
  }

  // ----------------------------------------------------
  // SCREEN 4: WINNER (Victory & Celebration)
  // ----------------------------------------------------
  if (screen === 'winner' && room) {
    const winners = room.results?.filter((r) => r.winner) || []
    const winnerPlayer = room.players.find((p) => p.id === winners[0]?.playerId) || room.players[0]

    return (
      <main className="min-h-screen text-[oklch(20%_0.014_255)] flex items-center justify-center p-6">
        {renderToast()}

        <div className="card-curled-wrap max-w-xl w-full">
          <div className="sheet-mat" />
          <div className="card-curled p-8 sm:p-12 text-center border border-[oklch(20%_0.014_255/12%)] shadow-2xl">
            <div className="mx-auto mb-6 grid size-24 place-items-center rounded-3xl bg-[oklch(87%_0.175_96)] text-[oklch(20%_0.014_255)] shadow-md">
              <Trophy className="size-12 text-[oklch(20%_0.014_255)]" />
            </div>

            <span className="chip-stamp chip-coral mb-2">Round Finished</span>
            <h1 className="font-display text-6xl sm:text-7xl font-black tracking-tight text-[oklch(20%_0.014_255)]">
              BINGO<span className="text-[oklch(68%_0.21_24)]">!</span>
            </h1>

            <p className="mt-4 text-xl font-bold text-[oklch(30%_0.014_255)]">
              🎉 <strong className="text-[oklch(68%_0.21_24)]">{winnerPlayer?.name}</strong> matched 5 complete lines and claimed victory!
            </p>
            <p className="text-xs text-[oklch(50%_0.014_255)] mt-1 font-semibold">
              {room.cardSize}×{room.cardSize} Card • Horizontals, Verticals & Diagonals matched
            </p>

            {/* Victory Podium Stats */}
            <div className="my-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-4">
                <Medal className="mx-auto size-5 text-[oklch(87%_0.175_96)]" />
                <p className="mt-1 font-mono text-2xl font-black">1st</p>
                <p className="text-[10px] uppercase font-bold text-[oklch(50%_0.014_255)]">Champion</p>
              </div>

              <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-4">
                <Dices className="mx-auto size-5 text-[oklch(82%_0.15_152)]" />
                <p className="mt-1 font-mono text-2xl font-black">{calledNumbers.length}</p>
                <p className="text-[10px] uppercase font-bold text-[oklch(50%_0.014_255)]">Numbers</p>
              </div>

              <div className="rounded-2xl border border-[oklch(20%_0.014_255/10%)] bg-[oklch(97.4%_0.012_95)] p-4">
                <Users className="mx-auto size-5 text-[oklch(68%_0.21_24)]" />
                <p className="mt-1 font-mono text-2xl font-black">{room.players.length}</p>
                <p className="text-[10px] uppercase font-bold text-[oklch(50%_0.014_255)]">Players</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-center gap-3">
              {isHost ? (
                <Button onClick={handlePlayAnotherRound} variant="pear" size="lg" className="w-full sm:w-auto px-8">
                  <RotateCcw className="size-5" /> Play Another Round
                </Button>
              ) : (
                <p className="text-xs text-[oklch(50%_0.014_255)] font-semibold">
                  Waiting for room host to initiate the next round...
                </p>
              )}

              <Button onClick={handleLeaveRoom} variant="ghost" size="sm">
                Return to Home
              </Button>
            </div>

            <span className="curl-corner" aria-hidden="true" />
          </div>
        </div>
      </main>
    )
  }

  return null
}
