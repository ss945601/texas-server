// Room represents a poker room where players can join before starting a game
const { generateID } = require('../utils/helpers');
const Game = require('./Game');

class Room {
    constructor(host, name, maxPlayers = 9) {
        this.id = generateID();
        this.name = name;
        this.host = host;
        this.maxPlayers = maxPlayers;
        this.players = [];
        this.game = null;
        this.isPrivate = false;
        this.password = '';
        this.createdAt = Date.now();
        this.status = 'waiting'; // 'waiting', 'playing', 'finished'
    }

    // Add a player to the room
    addPlayer(player) {
        if (this.players.length >= this.maxPlayers) {
            return { success: false, error: 'Room is full' };
        }
        
        if (this.status !== 'waiting') {
            return { success: false, error: 'Game is already in progress' };
        }

        // Check if player is already in the room
        if (this.players.some(p => p.id === player.id)) {
            return { success: false, error: 'Player already in room' };
        }

        this.players.push(player);
        return { success: true };
    }

    // Remove a player from the room
    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            const player = this.players[index];
            this.players.splice(index, 1);
            
            // If the host leaves, assign a new host
            if (player.id === this.host && this.players.length > 0) {
                this.host = this.players[0].id;
            }
            
            // If no players left, mark room for cleanup
            if (this.players.length === 0) {
                return { success: true, empty: true };
            }
            
            return { success: true, empty: false };
        }
        return { success: false, error: 'Player not found in room' };
    }

    // Start a new game in this room
    startGame() {
        if (this.players.length < 2) {
            return { success: false, error: 'Need at least 2 players to start' };
        }

        if (this.status !== 'waiting') {
            return { success: false, error: 'Game is already in progress' };
        }

        this.game = new Game();
        this.game.players = [...this.players];
        this.status = 'playing';
        
        // Start the game
        this.game.startRound();
        
        return { success: true, game: this.game };
    }

    // Check if a player can join (for private rooms)
    canJoin(password = null) {
        if (this.players.length >= this.maxPlayers) {
            return { success: false, error: 'Room is full' };
        }

        if (this.status !== 'waiting') {
            return { success: false, error: 'Game is already in progress' };
        }

        if (this.isPrivate && this.password && this.password !== password) {
            return { success: false, error: 'Invalid room password' };
        }

        return { success: true };
    }

    // Get room info for broadcasting
    getRoomInfo() {
        return {
            id: this.id,
            name: this.name,
            host: this.host,
            maxPlayers: this.maxPlayers,
            currentPlayers: this.players.length,
            isPrivate: this.isPrivate,
            status: this.status,
            createdAt: this.createdAt,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips
            }))
        };
    }

    // Broadcast message to all players in room
    broadcast(message) {
        for (const player of this.players) {
            if (player.active && player.conn && player.conn.readyState === 1) {
                try {
                    player.conn.send(JSON.stringify(message));
                } catch (error) {
                    console.error(`Error broadcasting to player ${player.name}:`, error);
                    player.active = false;
                }
            }
        }
    }

    // Clean up room resources
    destroy() {
        if (this.game) {
            this.game = null;
        }
        this.players = [];
    }
}

module.exports = Room;