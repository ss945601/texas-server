const { shuffleDeck, newDeck } = require('../utils/deck');
const { generateID } = require('../utils/helpers');
const { evaluateHand, compareHands, getCombinations, getHandRankName } = require('../utils/handEvaluator');
const Message = require('./Message');

// Game represents a poker game
class Game {
    constructor() {
        this.id = generateID();
        this.players = [];
        this.deck = shuffleDeck(newDeck());
        this.communityCards = [];
        this.pot = 0;
        this.currentTurn = 0;
        this.dealer = 0;
        this.smallBlind = 5;
        this.bigBlind = 10;
        this.state = 'waiting';
    }

    // Deals two hole cards to each active player
    dealHoleCards() {
        for (const player of this.players) {
            if (player.active) {
                if (this.deck.length < 2) {
                    console.log(`Error: Not enough cards in deck for player ${player.id}. Reshuffling.`);
                    this.deck = shuffleDeck(newDeck());
                }
                player.holeCards = [this.deck.shift(), this.deck.shift()];
            }
        }
    }

    // Deals the specified number of community cards
    dealCommunityCards(count) {
        if (this.deck.length < count) {
            console.log(`Error: Not enough cards to deal ${count} community cards. Reshuffling.`);
            this.deck = shuffleDeck(newDeck());
        }
        for (let i = 0; i < count; i++) {
            this.communityCards.push(this.deck.shift());
        }
    }

    // Initializes a new round of poker
    startRound() {
        console.log(`Game ${this.id}: Starting new round.`);

        // Ensure at least two active players with chips
        const activePlayers = this.players.filter(p => p.active && p.chips > 0).length;
        if (activePlayers < 2) {
            console.log(`Game ${this.id}: Not enough active players with chips (${activePlayers}). Waiting.`);
            this.state = 'waiting';
            this.broadcastGameState();
            return;
        }

        // Reset game state, preserve chip counts
        this.deck = shuffleDeck(newDeck());
        this.communityCards = [];
        this.pot = 0;
        this.state = 'preflop';

        // Move dealer button
        this.dealer = (this.dealer + 1) % this.players.length;
        while (!this.players[this.dealer].active) {
            this.dealer = (this.dealer + 1) % this.players.length;
        }

        // Reset player states
        for (const player of this.players) {
            player.holeCards = [];
            player.bet = 0;
            player.folded = false;
        }

        // Post blinds
        let smallBlindPos = (this.dealer + 1) % this.players.length;
        while (!this.players[smallBlindPos].active) {
            smallBlindPos = (smallBlindPos + 1) % this.players.length;
        }
        const smallBlindPlayer = this.players[smallBlindPos];

        let bigBlindPos = (smallBlindPos + 1) % this.players.length;
        while (!this.players[bigBlindPos].active) {
            bigBlindPos = (bigBlindPos + 1) % this.players.length;
        }
        const bigBlindPlayer = this.players[bigBlindPos];

        const smallBlindAmount = Math.min(this.smallBlind, smallBlindPlayer.chips);
        smallBlindPlayer.bet = smallBlindAmount;
        smallBlindPlayer.chips -= smallBlindAmount;
        this.pot += smallBlindAmount;
        console.log(`Game ${this.id}: ${smallBlindPlayer.name} posted small blind of ${smallBlindAmount}`);

        const bigBlindAmount = Math.min(this.bigBlind, bigBlindPlayer.chips);
        bigBlindPlayer.bet = bigBlindAmount;
        bigBlindPlayer.chips -= bigBlindAmount;
        this.pot += bigBlindAmount;
        console.log(`Game ${this.id}: ${bigBlindPlayer.name} posted big blind of ${bigBlindAmount}`);

        // Set current turn to player after big blind
        this.currentTurn = (bigBlindPos + 1) % this.players.length;
        while (!this.players[this.currentTurn].active) {
            this.currentTurn = (this.currentTurn + 1) % this.players.length;
        }

        // Deal hole cards
        this.dealHoleCards();

        // Broadcast game state
        this.broadcastGameState();
        console.log(`Game ${this.id}: Round started. State: ${this.state}`);
    }

    // Processes a player's action
    processAction(playerID, action) {
        const playerIndex = this.players.findIndex(p => p.id === playerID);
        const player = this.players[playerIndex];

        if (!player) {
            console.log(`Game ${this.id}: Action from unknown player ID: ${playerID}`);
            return;
        }
        if (!player.active) {
            console.log(`Game ${this.id}: Inactive player ${player.name} attempted action.`);
            return;
        }
        if (player.folded) {
            console.log(`Game ${this.id}: Folded player ${player.name} attempted action.`);
            return;
        }
        if (playerIndex !== this.currentTurn) {
            console.log(`Game ${this.id}: It's not ${player.name}'s turn.`);
            sendErrorMessage(player.conn, 'Not your turn.');
            return;
        }

        const highestBet = Math.max(...this.players.filter(p => p.active).map(p => p.bet));

        switch (action.type) {
            case 'fold':
                player.folded = true;
                console.log(`Game ${this.id}: Player ${player.name} folded.`);
                break;

            case 'check':
                if (player.bet < highestBet) {
                    console.log(`Game ${this.id}: Invalid check from ${player.name}. Highest bet is ${highestBet}.`);
                    sendErrorMessage(player.conn, 'Cannot check, there is an active bet.');
                    return;
                }
                console.log(`Game ${this.id}: Player ${player.name} checked.`);
                break;

            case 'call':
                let amountToCall = highestBet - player.bet;
                if (amountToCall <= 0) {
                    console.log(`Game ${this.id}: Invalid call from ${player.name}. No amount to call.`);
                    sendErrorMessage(player.conn, 'No amount to call.');
                    return;
                }
                if (amountToCall > player.chips) {
                    amountToCall = player.chips;
                    console.log(`Game ${this.id}: Player ${player.name} went all-in for ${amountToCall} (calling).`);
                } else {
                    console.log(`Game ${this.id}: Player ${player.name} called ${amountToCall}.`);
                }
                player.chips -= amountToCall;
                player.bet += amountToCall;
                this.pot += amountToCall;
                break;

            case 'bet':
                if (highestBet > player.bet) {
                    console.log(`Game ${this.id}: Invalid bet from ${player.name}. There's already a bet of ${highestBet}.`);
                    sendErrorMessage(player.conn, 'Cannot bet, someone has already bet. You must call or raise.');
                    return;
                }
                if (action.amount <= 0 || action.amount > player.chips) {
                    console.log(`Game ${this.id}: Invalid bet amount ${action.amount} from ${player.name}.`);
                    sendErrorMessage(player.conn, 'Invalid bet amount.');
                    return;
                }
                if (action.amount < this.bigBlind && this.state === 'preflop') {
                    console.log(`Game ${this.id}: Invalid bet amount ${action.amount} from ${player.name}. Must be at least big blind ${this.bigBlind}.`);
                    sendErrorMessage(player.conn, 'Bet must be at least the big blind.');
                    return;
                }
                if (action.amount < highestBet) {
                    console.log(`Game ${this.id}: Invalid bet amount ${action.amount} from ${player.name}. Must be at least ${highestBet}.`);
                    sendErrorMessage(player.conn, 'Your bet must be at least the current highest bet.');
                    return;
                }
                player.chips -= action.amount;
                player.bet += action.amount;
                this.pot += action.amount;
                console.log(`Game ${this.id}: Player ${player.name} bet ${action.amount}.`);
                break;

            case 'raise':
                if (action.amount <= 0 || action.amount > player.chips) {
                    console.log(`Game ${this.id}: Invalid raise amount ${action.amount} from ${player.name}.`);
                    sendErrorMessage(player.conn, 'Invalid raise amount.');
                    return;
                }
                let minRaiseIncrement = highestBet - player.bet;
                if (minRaiseIncrement === 0 && highestBet > 0) {
                    minRaiseIncrement = highestBet;
                } else if (minRaiseIncrement === 0) {
                    minRaiseIncrement = this.bigBlind;
                }
                const totalNewBet = player.bet + action.amount;
                if (totalNewBet < highestBet + minRaiseIncrement) {
                    console.log(`Game ${this.id}: Invalid raise from ${player.name}. Total bet ${totalNewBet} is less than required ${highestBet + minRaiseIncrement}.`);
                    sendErrorMessage(player.conn, 'Invalid raise amount. Must be at least the previous raise increment.');
                    return;
                }
                player.chips -= action.amount;
                player.bet += action.amount;
                this.pot += action.amount;
                console.log(`Game ${this.id}: Player ${player.name} raised by ${action.amount} to a total of ${player.bet}.`);
                break;

            default:
                console.log(`Game ${this.id}: Unknown action type '${action.type}' from player ${player.name}`);
                sendErrorMessage(player.conn, 'Unknown action type.');
                return;
        }

        this.moveToNextPlayer();

        if (this.isBettingRoundComplete()) {
            console.log(`Game ${this.id}: Betting round complete. Advancing game state.`);
            this.advanceGameState();
        }

        this.broadcastGameState();
    }

    // Moves to the next active, non-folded player
    moveToNextPlayer() {
        const initialTurn = this.currentTurn;
        do {
            this.currentTurn = (this.currentTurn + 1) % this.players.length;
            const player = this.players[this.currentTurn];
            if (player.active && !player.folded && player.chips > 0) {
                break;
            }
        } while (this.currentTurn !== initialTurn);
        console.log(`Game ${this.id}: Turn moved to ${this.players[this.currentTurn].name}.`);
    }

    // Checks if the current betting round is finished
    isBettingRoundComplete() {
        const activePlayers = this.players.filter(p => p.active && !p.folded);
        if (activePlayers.length <= 1) {
            return true;
        }
        const highestBet = Math.max(...activePlayers.map(p => p.bet));
        for (const player of activePlayers) {
            if (player.bet < highestBet && player.chips > 0) {
                return false;
            }
        }
        return true;
    }

    // Advances game to the next street
    advanceGameState() {
        switch (this.state) {
            case 'preflop':
                this.state = 'flop';
                this.dealCommunityCards(3);
                console.log(`Game ${this.id}: Advanced to Flop. Community cards: ${JSON.stringify(this.communityCards)}`);
                break;
            case 'flop':
                this.state = 'turn';
                this.dealCommunityCards(1);
                console.log(`Game ${this.id}: Advanced to Turn. Community cards: ${JSON.stringify(this.communityCards)}`);
                break;
            case 'turn':
                this.state = 'river';
                this.dealCommunityCards(1);
                console.log(`Game ${this.id}: Advanced to River. Community cards: ${JSON.stringify(this.communityCards)}`);
                break;
            case 'river':
                this.state = 'showdown';
                console.log(`Game ${this.id}: Advanced to Showdown.`);
                this.determineWinner();
                break;
            case 'showdown':
                console.log(`Game ${this.id}: Showdown complete. Starting new round in 5 seconds.`);
                setTimeout(() => this.startRound(), 5000);
                return;
        }

        if (this.state !== 'showdown') {
            for (const player of this.players) {
                player.bet = 0;
            }
            this.currentTurn = (this.dealer + 1) % this.players.length;
            while (!this.players[this.currentTurn].active || this.players[this.currentTurn].folded || this.players[this.currentTurn].chips === 0) {
                this.currentTurn = (this.currentTurn + 1) % this.players.length;
            }
            console.log(`Game ${this.id}: New street, current turn set to ${this.players[this.currentTurn].name}.`);
        }
        this.broadcastGameState();
    }

    // Determines the winner(s) of the hand
    determineWinner() {
        const activePlayers = this.players.filter(p => p.active && !p.folded);
        if (activePlayers.length === 1) {
            // Only one player remains
            const winner = activePlayers[0];
            winner.chips += this.pot;
            console.log(`Game ${this.id}: Winner: ${winner.name} (ID: ${winner.id}) won ${this.pot} chips (uncontested).`);

            const msg = new Message('winner', {
                playerID: winner.id,
                playerName: winner.name,
                amount: this.pot,
                hand: winner.holeCards,
                handRank: 'uncontested'
            });

            for (const p of this.players) {
                if (p.active) {
                    try {
                        p.conn.send(JSON.stringify(msg));
                    } catch (err) {
                        console.log(`Error sending winner message to ${p.name}: ${err}`);
                        p.active = false;
                        p.stop = true;
                    }
                }
            }
            this.pot = 0;
            return;
        }

        // Evaluate hands for all active players
        const handEvaluations = activePlayers.map(player => {
            const allCards = [...player.holeCards, ...this.communityCards];
            const combinations = getCombinations(allCards, 5);
            let bestHand = { rank: -1, value: 0, kickers: [] };
            let bestCards = [];
            combinations.forEach(combo => {
                const evaluation = evaluateHand(combo);
                if (compareHands(evaluation, bestHand) > 0) {
                    bestHand = evaluation;
                    bestCards = combo;
                }
            });
            return { player, evaluation: bestHand, bestCards };
        });

        // Find the best hand(s)
        handEvaluations.sort((a, b) => compareHands(b.evaluation, a.evaluation));
        const bestRank = handEvaluations[0].evaluation.rank;
        const winners = handEvaluations.filter(h => compareHands(h.evaluation, handEvaluations[0].evaluation) === 0);
        const splitPot = Math.floor(this.pot / winners.length);
        const remainder = this.pot % winners.length;

        winners.forEach((winner, index) => {
            const amount = splitPot + (index === 0 ? remainder : 0);
            winner.player.chips += amount;
            console.log(`Game ${this.id}: Winner: ${winner.player.name} (ID: ${winner.player.id}) won ${amount} chips with ${winner.evaluation.rankName}`);

            const msg = new Message('winner', {
                playerID: winner.player.id,
                playerName: winner.player.name,
                amount,
                hand: winner.bestCards,
                handRank: getHandRankName(winner.evaluation.rank)
            });

            for (const p of this.players) {
                if (p.active) {
                    try {
                        p.conn.send(JSON.stringify(msg));
                    } catch (err) {
                        console.log(`Error sending winner message to ${p.name}: ${err}`);
                        p.active = false;
                        p.stop = true;
                    }
                }
            }
        });

        this.pot = 0;
    }

    // Broadcasts game state to all active players
    broadcastGameState() {
        for (const player of this.players) {
            if (player.active) {
                const gameView = {
                    id: this.id,
                    players: this.getPlayersView(player.id),
                    communityCards: this.communityCards,
                    pot: this.pot,
                    currentTurn: this.currentTurn,
                    dealer: this.dealer,
                    smallBlind: this.smallBlind,
                    bigBlind: this.bigBlind,
                    state: this.state,
                    yourTurn: this.players[this.currentTurn].id === player.id
                };

                const msg = new Message('gameState', gameView);
                try {
                    player.conn.send(JSON.stringify(msg));
                } catch (err) {
                    console.log(`Error sending game state to ${player.name}: ${err}`);
                    player.active = false;
                    player.stop = true;
                }
            }
        }
        this.cleanUpInactivePlayers();
    }

    // Creates a filtered view of players, hiding other players' hole cards
    getPlayersView(viewerID) {
        return this.players.map(player => {
            const playerCopy = { ...player };
            if (playerCopy.id !== viewerID && this.state !== 'showdown') {
                playerCopy.holeCards = [];
            }
            delete playerCopy.conn;
            delete playerCopy.stop;
            return playerCopy;
        });
    }

    // Removes inactive players from the game
    cleanUpInactivePlayers() {
        this.players = this.players.filter(p => p.active);
        console.log(`Game ${this.id}: Current active players: ${this.players.length}`);
        if (this.players.length < 2 && this.state !== 'waiting') {
            console.log(`Game ${this.id}: Not enough active players (${this.players.length}). Resetting to 'waiting' state.`);
            this.state = 'waiting';
            this.deck = shuffleDeck(newDeck());
            this.communityCards = [];
            this.pot = 0;
        }
    }
}

// Helper function to send an error message to a client
function sendErrorMessage(conn, message) {
    const errMsg = new Message('error', { message });
    try {
        conn.send(JSON.stringify(errMsg));
    } catch (err) {
        console.log(`Error sending error message: ${err}`);
    }
}

module.exports = Game;