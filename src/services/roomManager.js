const Room = require('../models/Room');
const Game = require('../models/Game');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.playerRooms = new Map(); // Track which room each player is in
    }

    // Create a new room
    createRoom(host, name, maxPlayers = 9, isPrivate = false, password = null) {
        const room = new Room(host, name, maxPlayers);
        room.isPrivate = isPrivate;
        if (isPrivate) {
            room.password = password;
        }
        
        this.rooms.set(room.id, room);
        return room;
    }

    // Get a room by ID
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    // Get all available rooms
    getAvailableRooms() {
        const availableRooms = [];
        for (const [roomId, room] of this.rooms) {
            if (room.status === 'waiting' && room.players.length < room.maxPlayers) {
                availableRooms.push(room.getRoomInfo());
            }
        }
        return availableRooms;
    }

    // Add player to a room
    addPlayerToRoom(roomId, player, password = null) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'Room not found' };
        }

        const canJoin = room.canJoin(password);
        if (!canJoin.success) {
            return canJoin;
        }

        // Remove player from any existing room
        this.removePlayerFromRoom(player.id);

        const result = room.addPlayer(player);
        if (result.success) {
            this.playerRooms.set(player.id, roomId);
            return { success: true, room: room.getRoomInfo() };
        }
        
        return result;
    }

    // Remove player from their current room
    removePlayerFromRoom(playerId) {
        const roomId = this.playerRooms.get(playerId);
        if (roomId) {
            const room = this.rooms.get(roomId);
            if (room) {
                const result = room.removePlayer(playerId);
                this.playerRooms.delete(playerId);
                
                // Clean up empty rooms
                if (result.empty) {
                    room.destroy();
                    this.rooms.delete(roomId);
                }
                
                return { success: true, roomId };
            }
        }
        return { success: false, error: 'Player not in any room' };
    }

    // Get player's current room
    getPlayerRoom(playerId) {
        const roomId = this.playerRooms.get(playerId);
        return roomId ? this.rooms.get(roomId) : null;
    }

    // Start game in a room
    startGame(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'Room not found' };
        }

        // Check if player is the host
        if (room.host !== playerId) {
            return { success: false, error: 'Only the host can start the game' };
        }

        const result = room.startGame();
        if (result.success) {
            return { success: true, game: result.game };
        }
        
        return result;
    }

    // Get room info for a player
    getRoomInfoForPlayer(playerId) {
        const room = this.getPlayerRoom(playerId);
        return room ? room.getRoomInfo() : null;
    }

    // Broadcast to all players in a room
    broadcastToRoom(roomId, message) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.broadcast(message);
        }
    }

    // Clean up disconnected player
    handlePlayerDisconnect(playerId) {
        return this.removePlayerFromRoom(playerId);
    }

    // Clean up all rooms (for server shutdown)
    cleanup() {
        for (const [roomId, room] of this.rooms) {
            room.destroy();
        }
        this.rooms.clear();
        this.playerRooms.clear();
    }
}

module.exports = new RoomManager(); // Singleton instance