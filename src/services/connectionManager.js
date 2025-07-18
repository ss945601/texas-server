const Player = require('../models/Player');
const Message = require('../models/Message');
const Action = require('../models/Action');
const gameManager = require('./gameManager');
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
    const game = gameManager.findOrCreateGame();

    game.players.push(player);
    console.log(`Player ${player.name} (ID: ${player.id}) joined game ${game.id}`);

    // Deal hole cards to the player if the game is already in progress
    if (game.state !== 'waiting' && game.state !== 'showdown') {
        if (game.deck.length < 2) {
            console.log(`Error: Not enough cards in deck for new player ${player.id}. Reshuffling.`);
            game.deck = shuffleDeck(newDeck());
        }
        player.holeCards = [game.deck.shift(), game.deck.shift()];
        console.log(`Game ${game.id}: Dealt hole cards to new player ${player.name}`);
        
        // Broadcast updated game state to all players
        game.broadcastGameState();
    }
    // Start the game if there are enough players and it's in waiting state
    else if (game.players.length >= 2 && game.state === 'waiting') {
        console.log(`Game ${game.id}: Enough players (${game.players.length}) to start.`);
        game.startRound();
    }

    const welcomeMsg = new Message('welcome', {
        playerID: player.id,
        playerName: player.name,
        gameID: game.id
    });
    try {
        ws.send(JSON.stringify(welcomeMsg));
    } catch (err) {
        console.log(`Error sending welcome message to ${player.name}: ${err}`);
        player.active = false;
        game.cleanUpInactivePlayers();
        return;
    }

    ws.on('pong', () => {
        updateLastHeartbeat(player.id);
        console.log(`Received pong from player ${player.name}.`);
    });

    const pingInterval = setInterval(() => pingSender(ws, player.id, () => {
        player.active = false;
        game.cleanUpInactivePlayers();
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
            case 'action':
                const action = new Action(msg.payload.type, msg.payload.amount);
                game.processAction(player.id, action);
                break;

            case 'chat':
                if (typeof msg.payload !== 'string') {
                    console.log(`Invalid chat message payload type from ${player.name}: ${typeof msg.payload}`);
                    sendErrorMessage(ws, 'Invalid chat message format.');
                    return;
                }
                const chatMsg = new Message(' chat', {
                    playerID: player.id,
                    playerName: player.name,
                    message: msg.payload
                });
                for (const p of game.players) {
                    if (p.active) {
                        try {
                            p.conn.send(JSON.stringify(chatMsg));
                        } catch (err) {
                            console.log(`Error sending chat message to ${p.name}: ${err}`);
                            p.active = false;
                            p.stop = true;
                        }
                    }
                }
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
        game.cleanUpInactivePlayers();
        clearInterval(pingInterval);
    });

    ws.on('error', err => {
        console.log(`WebSocket error for player ${player.name}: ${err}`);
        player.active = false;
        player.stop = true;
        game.cleanUpInactivePlayers();
        clearInterval(pingInterval);
    });
}

module.exports = {
    handleConnection,
    updateLastHeartbeat,
    getLastHeartbeat,
    sendErrorMessage
};