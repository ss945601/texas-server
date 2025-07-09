# WebSocket Poker Game Server

This repository contains a WebSocket-based poker game server implementation with client-side code for communication. The server manages poker games, player connections, and game state, while clients connect via WebSocket to participate in games.

## Server-Client Communication Protocol

The communication between the server and clients is based on WebSocket protocol, allowing for real-time bidirectional communication. Below is a detailed explanation of the communication methods and message formats.

### Connection Establishment

1. **Client Connection**: Clients connect to the server via WebSocket at endpoint `ws://localhost:8080/ws`
2. **Server Upgrade**: The server upgrades the HTTP connection to WebSocket using the Gorilla WebSocket library
3. **Welcome Message**: Upon successful connection, the server sends a welcome message to the client with player and game information

### Message Format

All messages exchanged between the server and client follow a standard JSON format:

```json
{
  "type": "message_type",
  "payload": { ... }
}
```

Where:
- `type`: Identifies the message type (e.g., "action", "chat", "heartbeat")
- `payload`: Contains the message data, which varies based on the message type

### Message Types

#### From Client to Server

1. **Action Messages**
   ```json
   {
     "type": "action",
     "payload": {
       "type": "check|call|fold|bet|raise",
       "amount": 0
     }
   }
   ```

2. **Chat Messages**
   ```json
   {
     "type": "chat",
     "payload": "Chat message content"
   }
   ```

3. **Heartbeat Messages**
   ```json
   {
     "type": "heartbeat",
     "payload": { "timestamp": 1234567890123 }
   }
   ```

#### From Server to Client

1. **Welcome Messages**
   ```json
   {
     "type": "welcome",
     "payload": {
       "playerID": "abc123",
       "playerName": "Player abc1",
       "gameID": "game123"
     }
   }
   ```

2. **Game State Updates**
   ```json
   {
     "type": "gameState",
     "payload": { ... game state object ... }
   }
   ```

3. **Chat Broadcasts**
   ```json
   {
     "type": "chat",
     "payload": {
       "playerID": "abc123",
       "playerName": "Player abc1",
       "message": "Hello everyone!"
     }
   }
   ```

4. **Error Messages**
   ```json
   {
     "type": "error",
     "payload": {
       "message": "Error description"
     }
   }
   ```

5. **Heartbeat Acknowledgments**
   ```json
   {
     "type": "heartbeat_ack",
     "payload": {
       "timestamp": 1234567890123,
       "status": "ok"
     }
   }
   ```

### Connection Maintenance

The server and client implement a robust heartbeat mechanism to maintain connection health:

#### Server-Side Heartbeat

1. The server sends WebSocket ping frames every `pingPeriod` (54 seconds)
2. The server expects clients to respond with pong frames
3. The server tracks the last heartbeat time for each client
4. If no heartbeat (pong or explicit heartbeat message) is received within `pongWait` (60 seconds), the server closes the connection

#### Client-Side Heartbeat

1. The client sends explicit heartbeat messages every 30 seconds
2. The client automatically responds to server ping frames with pong frames (handled by the WebSocket library)
3. The client implements reconnection logic with exponential backoff if the connection is lost

### Reconnection Strategy

The client implements a reconnection strategy with the following characteristics:

1. Attempts to reconnect up to 5 times
2. Uses a fixed delay of 3 seconds between attempts
3. Resets the reconnection counter on successful reconnection
4. Restarts the heartbeat mechanism after reconnection

## Game State Management

The server maintains the game state and broadcasts updates to all connected clients when the state changes. The game state includes:

- Player information (IDs, names, chips, bets, etc.)
- Community cards
- Current game phase (waiting, preflop, flop, turn, river, showdown)
- Pot size
- Current player turn

## Error Handling

The server sends structured error messages to clients when invalid actions are attempted. Clients should handle these error messages appropriately and display them to the user.

## Implementation Details

### Server (Go)

- Uses Gorilla WebSocket library for WebSocket handling
- Implements concurrent game management with goroutines and mutexes
- Handles player connections, disconnections, and reconnections
- Manages game state and rules enforcement

### Client (JavaScript)

- Uses the 'ws' library for WebSocket communication
- Implements heartbeat mechanism to maintain connection
- Handles reconnection logic for connection resilience
- Parses and processes server messages

## Running the Application

### Server

```bash
go run main.go
```

The server will start on port 8080.

### Client

```bash
cd ws-client
node client.js
```

The client will connect to the server at `ws://localhost:8080/ws`.