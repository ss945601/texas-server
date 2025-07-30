const Player = require('../models/Player');
const Message = require('../models/Message');
const Action = require('../models/Action');
const roomManager = require('./roomManager');
const { generateID } = require('../utils/helpers');

// Connection constants
const writeWait = 10000; // 10 seconds
const pongWait = 60000; // 60 seconds
const pingPeriod = (pongWait * 9) / 10;
const maxMessageSize = 512;

// Store last heartbeat times
const lastHeartbeats = new Map();

// Updates the last heartbeat time for a player
function updateLastHeartbeat(playerID) {
    lastHeartbeats.set(playerID, Date.now());
}

// Gets the last heartbeat time for a player
function getLastHeartbeat(playerID) {
    return lastHeartbeats.get(playerID) || Date.now();
}

// Sends ping messages to keep the connection alive
function pingSender(conn, playerID, stopCallback) {
    const interval = setInterval(() => {
        const lastHB = getLastHeartbeat(playerID);
        if (Date.now() - lastHB > pongWait) {
            console.log(`No heartbeat from player ${playerID} in ${pongWait}ms, closing connection`);
            clearInterval(interval);
            conn.terminate();
            stopCallback();
            return;
        }
        try {
            conn.ping();
        } catch (err) {
            console.log(`Ping error for player ${playerID}: ${err}`);
            clearInterval(interval);
            conn.terminate();
            stopCallback();
        }
    }, pingPeriod);
    return interval;
}

// Sends an error message to a client
function sendErrorMessage(conn, message) {
    const errMsg = new Message('error', { message });
    try {
        conn.send(JSON.stringify(errMsg));
    } catch (err) {
        console.log(`Error sending error message: ${err}`);
    }
}

// Handle a new WebSocket connection
function handleConnection(ws) {
    const player = new Player(generateID(), `Player_${generateID().slice(0, 4)}`, ws);
    console.log(`Player ${player.name} (ID: ${player.id}) connected`);

    // Send welcome message with room system info
    const welcomeMsg = new Message('welcome', {
        playerID: player.id,
        playerName: player.name,
        message: 'Welcome! Please create or join a room to start playing.'
    });
    try {
        ws.send(JSON.stringify(welcomeMsg));
    } catch (err) {
        console.log(`Error sending welcome message to ${player.name}: ${err}`);
        player.active = false;
        return;
    }

    // Send available rooms list
    const availableRooms = roomManager.getAvailableRooms();
    const roomsMsg = new Message('rooms_list', availableRooms);
    try {
        ws.send(JSON.stringify(roomsMsg));
    } catch (err) {
        console.log(`Error sending rooms list to ${player.name}: ${err}`);
    }

    ws.on('pong', () => {
        updateLastHeartbeat(player.id);
        console.log(`Received pong from player ${player.name}.`);
    });

    const pingInterval = setInterval(() => pingSender(ws, player.id, () => {
        player.active = false;
        roomManager.handlePlayerDisconnect(player.id);
        clearInterval(pingInterval);
    }), pingPeriod);

    ws.on('message', data => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (err) {
            console.log(`Error parsing message from ${player.name}: ${err}`);
            sendErrorMessage(ws, 'Invalid message format.');
            return;
        }

        switch (msg.type) {
            case 'create_room':
                const { name, maxPlayers, isPrivate, password } = msg.payload;
                const room = roomManager.createRoom(player.id, name, maxPlayers || 9, isPrivate || false, password);
                const joinResult = roomManager.addPlayerToRoom(room.id, player);
                
                if (joinResult.success) {
                    const response = new Message('room_created', {
                        room: room.getRoomInfo(),
                        player: {
                            id: player.id,
                            name: player.name,
                            chips: player.chips
                        }
                    });
                    ws.send(JSON.stringify(response));
                    
                    // Broadcast updated room info to all players
                    room.broadcast(new Message('room_updated', room.getRoomInfo()));
                } else {
                    sendErrorMessage(ws, joinResult.error);
                }
                break;

            case 'join_room':
                const { roomId, password: roomPassword } = msg.payload;
                const joinRoomResult = roomManager.addPlayerToRoom(roomId, player, roomPassword);
                
                if (joinRoomResult.success) {
                    const response = new Message('room_joined', {
                        room: joinRoomResult.room,
                        player: {
                            id: player.id,
                            name: player.name,
                            chips: player.chips
                        }
                    });
                    ws.send(JSON.stringify(response));
                    
                    // Broadcast updated room info to all players in the room
                    const joinedRoom = roomManager.getRoom(roomId);
                    if (joinedRoom) {
                        joinedRoom.broadcast(new Message('room_updated', joinedRoom.getRoomInfo()));
                    }
                } else {
                    sendErrorMessage(ws, joinRoomResult.error);
                }
                break;

            case 'leave_room':
                const leaveResult = roomManager.removePlayerFromRoom(player.id);
                if (leaveResult.success) {
                    const response = new Message('room_left', { success: true });
                    ws.send(JSON.stringify(response));
                    
                    // Send updated rooms list
                    const availableRooms = roomManager.getAvailableRooms();
                    ws.send(JSON.stringify(new Message('rooms_list', availableRooms)));
                }
                break;

            case 'get_rooms':
                const rooms = roomManager.getAvailableRooms();
                ws.send(JSON.stringify(new Message('rooms_list', rooms)));
                break;

            case 'start_game':
                const playerRoom = roomManager.getPlayerRoom(player.id);
                if (!playerRoom) {
                    sendErrorMessage(ws, 'You are not in a room');
                    return;
                }
                
                const startResult = roomManager.startGame(playerRoom.id, player.id);
                if (startResult.success) {
                    const game = startResult.game;
                    
                    // Send game started message to all players in the room
                    playerRoom.broadcast(new Message('game_started', {
                        gameId: game.id,
                        players: game.players.map(p => ({
                            id: p.id,
                            name: p.name,
                            chips: p.chips
                        }))
                    }));
                    
                    // Broadcast initial game state
                    game.broadcastGameState();
                } else {
                    sendErrorMessage(ws, startResult.error);
                }
                break;

            case 'action':
                const playerCurrentRoom = roomManager.getPlayerRoom(player.id);
                if (!playerCurrentRoom || !playerCurrentRoom.game) {
                    sendErrorMessage(ws, 'No active game');
                    return;
                }
                
                const action = new Action(msg.payload.type, msg.payload.amount);
                playerCurrentRoom.game.processAction(player.id, action);
                break;

            case 'chat':
                if (typeof msg.payload !== 'string') {
                    console.log(`Invalid chat message payload type from ${player.name}: ${typeof msg.payload}`);
                    sendErrorMessage(ws, 'Invalid chat message format.');
                    return;
                }
                
                const playerChatRoom = roomManager.getPlayerRoom(player.id);
                if (!playerChatRoom) {
                    sendErrorMessage(ws, 'You are not in a room');
                    return;
                }
                
                const chatMsg = new Message('chat', {
                    playerID: player.id,
                    playerName: player.name,
                    message: msg.payload
                });
                playerChatRoom.broadcast(chatMsg);
                break;

            case 'heartbeat':
                updateLastHeartbeat(player.id);
                console.log(`Received heartbeat from player ${player.name}.`);
                const heartbeatResponse = new Message('heartbeat_ack', {
                    timestamp: Date.now(),
                    status: 'ok'
                });
                try {
                    ws.send(JSON.stringify(heartbeatResponse));
                } catch (err) {
                    console.log(`Error sending heartbeat response to ${player.name}: ${err}`);
                }
                break;

            default:
                console.log(`Unknown message type '${msg.type}' from player ${player.name} (ID: ${player.id})`);
                sendErrorMessage(ws, 'Unknown message type.');
        }
    });

    ws.on('close', () => {
        console.log(`Player ${player.name} (ID: ${player.id}) disconnected.`);
        player.active = false;
        player.stop = true;
        
        // Clean up from room
        const leaveResult = roomManager.handlePlayerDisconnect(player.id);
        if (leaveResult.success && leaveResult.roomId) {
            const room = roomManager.getRoom(leaveResult.roomId);
            if (room) {
                room.broadcast(new Message('room_updated', room.getRoomInfo()));
            }
        }
        
        clearInterval(pingInterval);
    });

    ws.on('error', err => {
        console.log(`WebSocket error for player ${player.name}: ${err}`);
        player.active = false;
        player.stop = true;
        
        // Clean up from room
        const leaveResult = roomManager.handlePlayerDisconnect(player.id);
        if (leaveResult.success && leaveResult.roomId) {
            const room = roomManager.getRoom(leaveResult.roomId);
            if (room) {
                room.broadcast(new Message('room_updated', room.getRoomInfo()));
            }
        }
        
        clearInterval(pingInterval);
    });
}

module.exports = {
    handleConnection,
    updateLastHeartbeat,
    getLastHeartbeat,
    sendErrorMessage
};