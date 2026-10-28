# Real-Time Multiplayer Bingo API Documentation

This document describes the REST endpoints and Socket.IO real-time contract for the Multiplayer Bingo backend.

---

## 1. Response Envelope

All Socket.IO acknowledgements and REST responses conform to the standard response envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "requestId": "socket-or-request-id"
}
```

In the event of an error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  },
  "requestId": "socket-or-request-id"
}
```

---

## 2. REST Endpoints

### Health Check
- **Path:** `GET /health`
- **Description:** Verifies service availability.
- **Response:**
  ```json
  {
    "success": true,
    "data": { "status": "ok" },
    "error": null,
    "requestId": "req-123"
  }
  ```

---

## 3. Socket.IO Client Commands (Emitted by Client)

### `room:create`
Creates a new game room. The emitting socket automatically becomes the host.
- **Payload:**
  ```typescript
  {
    name: string                // Display name (1-32 chars)
    cardSize?: number           // Default 5
    rangeMin?: number           // Default 1
    rangeMax?: number           // Default 75
    minPlayers?: number         // Default 2
    maxPlayers?: number         // Default 10
    countdownSeconds?: number   // Default 5
    winningCondition?: "FIRST_LINE" | "FIVE_LINES" | "FULL_CARD" // Default "FIVE_LINES"
  }
  ```
- **Callback Data:**
  ```typescript
  {
    roomId: string
    code: string                // 6-character room code
    playerId: string
    reconnectToken: string      // Persist in localStorage for reconnection
    room: RoomStateObject
    player: PlayerObject
  }
  ```

### `room:join`
Joins an existing room in `WAITING` state.
- **Payload:**
  ```typescript
  {
    code: string                // Room code
    name: string                // Display name (unique per room)
  }
  ```
- **Callback Data:** Same as `room:create`.

### `room:reconnect`
Restores an existing player session following a network drop or page refresh.
- **Payload:**
  ```typescript
  {
    playerId: string
    reconnectToken: string
  }
  ```
- **Callback Data:** Full authoritative room state, player card, and called numbers history.

### `card:rearrange`
Rearranges number positions on the player's card before the game starts.
- **Payload:**
  ```typescript
  {
    values: number[]            // Permutation of the exact same numbers
  }
  ```
- **Preconditions:** Room in `WAITING` state and player not yet ready. Center FREE space (if applicable) must remain at index 12.

### `player:ready`
Toggles readiness. When all connected players (`>= minPlayers`) are ready, a countdown begins.
- **Payload:**
  ```typescript
  {
    ready: boolean
  }
  ```

### `game:start`
Host-authorized immediate start trigger.
- **Payload:** `{}`
- **Preconditions:** Caller must be room host and room must have `>= minPlayers`.

### `game:select`
Selects or calls a number on the current player's turn.
- **Payload:**
  ```typescript
  {
    number: number
    idempotencyKey: string      // Unique key to prevent double selections
  }
  ```
- **Preconditions:** Room in `PLAYING` state and `room.currentPlayerId === socket.playerId`.
- **Side Effects:** Number marked on all matching cards in DB, completed lines and scores calculated, winning condition checked, turn rotated or game finished.

### `game:claim`
Claims Bingo.
- **Payload:** `{}`
- **Side Effects:** Server authoritatively validates completed lines against the winning condition. If valid, finishes game.

### `room:restart`
Host-only action to start a fresh round with new randomized cards.
- **Payload:** `{}`

### `room:cancel`
Host-only action to cancel the room.
- **Payload:** `{}`

---

## 4. Socket.IO Server Events (Broadcast to Room)

| Event Name | Description |
| :--- | :--- |
| `room:state` | Authoritative broadcast of full room details, connected players, scores, cards, and selections. |
| `room:countdown` | Emitted every second during countdown (`{ remaining: number }`). |
| `room:countdown_cancelled` | Emitted when countdown is aborted due to a player becoming unready or disconnecting. |
| `game:started` | Emitted when countdown reaches 0 and game transitions to `PLAYING`. |
| `number:selected` | Emitted whenever a number is accepted. Includes selected number, caller, next player, and updated scores. |
| `game:finished` | Emitted when a player meets the winning condition. Includes winners and final scoreboard. |
| `room:restarted` | Emitted when the host starts a new round. |
| `room:cancelled` | Emitted when the host cancels the room. |
| `player:disconnected` | Emitted when a player loses connection. |

---

## 5. Standard Error Codes

- `INVALID_PAYLOAD`: Validation error via Zod schemas.
- `ROOM_NOT_FOUND`: Room code does not exist.
- `GAME_STARTED`: Cannot join a room that has already started.
- `ROOM_FULL`: Maximum players reached.
- `DUPLICATE_NAME`: Display name already in use within the room.
- `UNAUTHORIZED`: Invalid reconnect token or unauthenticated socket.
- `FORBIDDEN`: Host-only action attempted by non-host player.
- `OUT_OF_TURN`: Player attempted to select outside of their turn.
- `NUMBER_ALREADY_CALLED`: Number was previously called in this game session.
- `INVALID_CARD`: Rearranged card does not contain the exact original numbers.
- `INVALID_BINGO`: Bingo claim submitted without satisfying the winning condition.
