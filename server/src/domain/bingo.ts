import { randomBytes, randomInt } from 'node:crypto'

export type Cell = number
export type WinningCondition = 'FIRST_LINE' | 'FIVE_LINES' | 'FULL_CARD'
export type RoomState = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED' | 'CANCELLED'

export interface Card {
  size: number
  values: number[]
  marked: number[]
}

export function getLetter(number: number): string {
  if (number === 0) return 'FREE'
  if (number <= 15) return 'B'
  if (number <= 30) return 'I'
  if (number <= 45) return 'N'
  if (number <= 60) return 'G'
  return 'O'
}

function shuffle<T>(array: T[], nextRandom: () => number): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextRandom() % (i + 1)
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

export function generateCard(size: number, min: number, max: number, seed?: number): Card {
  const total = size * size
  if (!Number.isInteger(size) || size < 5 || size > 10) {
    throw new Error('CARD_SIZE_UNSUPPORTED')
  }
  if (max - min + 1 < total) {
    throw new Error('RANGE_TOO_SMALL')
  }

  let state = seed ?? randomInt(1, 2 ** 31 - 1)
  const next = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state
  }

  // Traditional B-I-N-G-O 5x5 card structure with FREE space in the center
  if (size === 5 && min === 1 && max === 75) {
    const colB = shuffle(Array.from({ length: 15 }, (_, i) => 1 + i), next).slice(0, 5)
    const colI = shuffle(Array.from({ length: 15 }, (_, i) => 16 + i), next).slice(0, 5)
    const colN = shuffle(Array.from({ length: 15 }, (_, i) => 31 + i), next).slice(0, 4)
    const colG = shuffle(Array.from({ length: 15 }, (_, i) => 46 + i), next).slice(0, 5)
    const colO = shuffle(Array.from({ length: 15 }, (_, i) => 61 + i), next).slice(0, 5)

    const values = new Array<number>(25)
    for (let r = 0; r < 5; r++) {
      values[r * 5 + 0] = colB[r]
      values[r * 5 + 1] = colI[r]
      if (r === 2) {
        values[r * 5 + 2] = 0 // Center FREE space
      } else {
        const nIndex = r > 2 ? r - 1 : r
        values[r * 5 + 2] = colN[nIndex]
      }
      values[r * 5 + 3] = colG[r]
      values[r * 5 + 4] = colO[r]
    }

    return { size, values, marked: [0] }
  }

  // Generalized arbitrary card generation
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const shuffledPool = shuffle(pool, next)
  const values = shuffledPool.slice(0, total)
  return { size, values, marked: [] }
}

export function token(): string {
  return randomBytes(32).toString('base64url')
}

export function roomCode(): string {
  return randomBytes(4).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toUpperCase()
}

export function validateArrangement(original: number[], arranged: number[], size: number): boolean {
  if (arranged.length !== size * size || new Set(arranged).size !== arranged.length) {
    return false
  }

  // If standard 5x5 with center FREE (0), center must stay at index 12
  if (size === 5 && original.includes(0) && arranged[12] !== 0) {
    return false
  }

  const sortedOriginal = [...original].sort((a, b) => a - b)
  const sortedArranged = [...arranged].sort((a, b) => a - b)
  return sortedOriginal.every((val, idx) => val === sortedArranged[idx])
}

export function completedLines(card: Card): number[] {
  const { size, values, marked } = card
  const set = new Set(marked)
  const lines: number[][] = []

  // Horizontal rows (indices 0..size-1)
  for (let r = 0; r < size; r++) {
    lines.push(Array.from({ length: size }, (_, c) => r * size + c))
  }

  // Vertical columns (indices size..2*size-1)
  for (let c = 0; c < size; c++) {
    lines.push(Array.from({ length: size }, (_, r) => r * size + c))
  }

  // Diagonals: main (index 2*size) and anti (index 2*size + 1)
  lines.push(Array.from({ length: size }, (_, i) => i * size + i))
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)))

  return lines
    .map((line, idx) => (line.every((cellIndex) => set.has(values[cellIndex])) ? idx : -1))
    .filter((idx) => idx >= 0)
}

export function hasWon(card: Card, condition: WinningCondition): boolean {
  if (condition === 'FULL_CARD') {
    const set = new Set(card.marked)
    return card.values.every((val) => set.has(val))
  }

  const lines = completedLines(card)
  return condition === 'FIRST_LINE' ? lines.length >= 1 : lines.length >= 5
}
