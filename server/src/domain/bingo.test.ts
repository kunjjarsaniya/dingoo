import { describe, expect, it } from 'vitest'
import {
  completedLines,
  generateCard,
  getLetter,
  hasWon,
  validateArrangement,
  type Card,
} from './bingo'

describe('bingo domain logic', () => {
  it('generates valid 5x5 card with traditional B-I-N-G-O columns and center FREE space', () => {
    const card = generateCard(5, 1, 75, 42)
    expect(card.size).toBe(5)
    expect(card.values.length).toBe(25)

    // Center cell (row 2, col 2 -> index 12) is FREE (0) and pre-marked
    expect(card.values[12]).toBe(0)
    expect(card.marked).toEqual([0])

    // Verify column ranges
    for (let r = 0; r < 5; r++) {
      const b = card.values[r * 5 + 0]
      const i = card.values[r * 5 + 1]
      const n = card.values[r * 5 + 2]
      const g = card.values[r * 5 + 3]
      const o = card.values[r * 5 + 4]

      expect(b).toBeGreaterThanOrEqual(1)
      expect(b).toBeLessThanOrEqual(15)

      expect(i).toBeGreaterThanOrEqual(16)
      expect(i).toBeLessThanOrEqual(30)

      if (r !== 2) {
        expect(n).toBeGreaterThanOrEqual(31)
        expect(n).toBeLessThanOrEqual(45)
      }

      expect(g).toBeGreaterThanOrEqual(46)
      expect(g).toBeLessThanOrEqual(60)

      expect(o).toBeGreaterThanOrEqual(61)
      expect(o).toBeLessThanOrEqual(75)
    }

    // Verify all 24 numbers are unique (excluding the free cell)
    const numbersOnly = card.values.filter((v) => v !== 0)
    expect(new Set(numbersOnly).size).toBe(24)
  })

  it('generates deterministic cards when identical seeds are provided', () => {
    const a = generateCard(5, 1, 75, 999)
    const b = generateCard(5, 1, 75, 999)
    expect(a.values).toEqual(b.values)
  })

  it('validates card rearrangement rules strictly', () => {
    const c = generateCard(5, 1, 75, 1)
    const original = c.values

    // A valid rearrangement keeps all same numbers and free center at index 12
    const swapped = [...original]
    // swap two non-center cells (index 0 and index 1)
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(validateArrangement(original, swapped, 5)).toBe(true)

    // Invalid: duplicate numbers
    const dup = [...original]
    dup[0] = dup[1]
    expect(validateArrangement(original, dup, 5)).toBe(false)

    // Invalid: moving the free center
    const movedCenter = [...original]
    ;[movedCenter[0], movedCenter[12]] = [movedCenter[12], movedCenter[0]]
    expect(validateArrangement(original, movedCenter, 5)).toBe(false)

    // Invalid: extra or missing numbers
    expect(validateArrangement(original, original.slice(0, 24), 5)).toBe(false)
  })

  it('detects all completed lines: rows, columns, and diagonals including FREE space', () => {
    const c = generateCard(5, 1, 75, 1)

    // Center row (row 2: indices 10, 11, 12, 13, 14)
    // Note index 12 is FREE (0) and already in c.marked
    c.marked = [0, c.values[10], c.values[11], c.values[13], c.values[14]]
    const lines = completedLines(c)
    expect(lines).toContain(2) // Row index 2 is completed!

    // Mark the entire column 2 (indices 2, 7, 12, 17, 22)
    c.marked.push(c.values[2], c.values[7], c.values[17], c.values[22])
    const linesWithCol = completedLines(c)
    expect(linesWithCol).toContain(2) // Row 2
    expect(linesWithCol).toContain(7) // Column 2 (col index 2 -> 5 + 2 = 7)

    // Mark main diagonal (indices 0, 6, 12, 18, 24)
    c.marked.push(c.values[0], c.values[6], c.values[18], c.values[24])
    const linesWithDiag = completedLines(c)
    expect(linesWithDiag).toContain(10) // Main diagonal

    // Mark anti diagonal (indices 4, 8, 12, 16, 20)
    c.marked.push(c.values[4], c.values[8], c.values[16], c.values[20])
    const allLines = completedLines(c)
    expect(allLines).toContain(11) // Anti diagonal
  })

  it('evaluates winning conditions: FIRST_LINE, FIVE_LINES, and FULL_CARD', () => {
    const c = generateCard(5, 1, 75, 1)
    expect(hasWon(c, 'FIRST_LINE')).toBe(false)
    expect(hasWon(c, 'FIVE_LINES')).toBe(false)
    expect(hasWon(c, 'FULL_CARD')).toBe(false)

    // 1 completed row
    c.marked = [0, c.values[0], c.values[1], c.values[2], c.values[3], c.values[4]]
    expect(hasWon(c, 'FIRST_LINE')).toBe(true)
    expect(hasWon(c, 'FIVE_LINES')).toBe(false)

    // Complete 5 lines (all 5 rows)
    c.marked = [...c.values]
    expect(hasWon(c, 'FIRST_LINE')).toBe(true)
    expect(hasWon(c, 'FIVE_LINES')).toBe(true)
    expect(hasWon(c, 'FULL_CARD')).toBe(true)
  })

  it('generates N x N card with numbers strictly ranging from 1 to N^2 (e.g. 5x5 with 1..25)', () => {
    // 5x5 card with numbers 1 to 25
    const card5 = generateCard(5, 1, 25, 77)
    expect(card5.size).toBe(5)
    expect(card5.values.length).toBe(25)
    expect(card5.marked).toEqual([])

    // Every number from 1 to 25 must be present exactly once
    const set5 = new Set(card5.values)
    expect(set5.size).toBe(25)
    for (let i = 1; i <= 25; i++) {
      expect(set5.has(i)).toBe(true)
    }

    // 6x6 card with numbers 1 to 36
    const card6 = generateCard(6, 1, 36, 88)
    expect(card6.size).toBe(6)
    expect(card6.values.length).toBe(36)
    const set6 = new Set(card6.values)
    expect(set6.size).toBe(36)
    for (let i = 1; i <= 36; i++) {
      expect(set6.has(i)).toBe(true)
    }

    // 10x10 card with numbers 1 to 100
    const card10 = generateCard(10, 1, 100, 99)
    expect(card10.size).toBe(10)
    expect(card10.values.length).toBe(100)
    const set10 = new Set(card10.values)
    expect(set10.size).toBe(100)
    for (let i = 1; i <= 100; i++) {
      expect(set10.has(i)).toBe(true)
    }

    // Rejects sizes outside 5..10 range
    expect(() => generateCard(4, 1, 16)).toThrow('CARD_SIZE_UNSUPPORTED')
    expect(() => generateCard(11, 1, 121)).toThrow('CARD_SIZE_UNSUPPORTED')
  })

  it('detects winning condition when any 5 complete lines are matched on a 5x5 (1..25) card', () => {
    const card = generateCard(5, 1, 25, 123)
    // Initially 0 lines
    expect(completedLines(card)).toHaveLength(0)
    expect(hasWon(card, 'FIVE_LINES')).toBe(false)

    // Complete 3 horizontal rows (rows 0, 1, 2)
    const row0 = [card.values[0], card.values[1], card.values[2], card.values[3], card.values[4]]
    const row1 = [card.values[5], card.values[6], card.values[7], card.values[8], card.values[9]]
    const row2 = [card.values[10], card.values[11], card.values[12], card.values[13], card.values[14]]
    card.marked = [...row0, ...row1, ...row2]
    expect(completedLines(card)).toHaveLength(3)
    expect(hasWon(card, 'FIVE_LINES')).toBe(false)

    // Complete 2 vertical columns (cols 0, 1) by marking remaining elements in rows 3 & 4
    card.marked.push(card.values[15], card.values[20]) // completes col 0
    card.marked.push(card.values[16], card.values[21]) // completes col 1
    const lines = completedLines(card)
    // 3 rows + 2 columns = 5 completed lines!
    expect(lines.length).toBeGreaterThanOrEqual(5)
    expect(hasWon(card, 'FIVE_LINES')).toBe(true)
  })

  it('correctly maps numbers to B-I-N-G-O letters', () => {
    expect(getLetter(0)).toBe('FREE')
    expect(getLetter(1)).toBe('B')
    expect(getLetter(15)).toBe('B')
    expect(getLetter(16)).toBe('I')
    expect(getLetter(30)).toBe('I')
    expect(getLetter(31)).toBe('N')
    expect(getLetter(45)).toBe('N')
    expect(getLetter(46)).toBe('G')
    expect(getLetter(60)).toBe('G')
    expect(getLetter(61)).toBe('O')
    expect(getLetter(75)).toBe('O')
  })
})
