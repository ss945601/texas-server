const Game = require('../models/Game');

class GameManager {
    constructor() {
        this.games = new Map();
    }

    // Find or create a game for a player
    findOrCreateGame() {
        // Find an existing game with space
        for (const [_, game] of this.games) {
            if (game.state === 'waiting' && game.players.length < 9) {
                return game;
            }
        }

        // Create a new game if none found
        const game = new Game();
        this.games.set(game.id, game);
        return game;
    }

    // Get a game by ID
    getGame(gameId) {
        return this.games.get(gameId);
    }

    // Remove a game
    removeGame(gameId) {
        this.games.delete(gameId);
    }
}

module.exports = new GameManager(); // Singleton instance