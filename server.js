const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Card represents a playing card
class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
    }
}

// Player represents a poker player
class Player {
    constructor(id, name, conn) {
        this.id = id;
        this.name = name;
        this.conn = conn;
        this.holeCards = [];
        this.chips = 1000;
        this.bet = 0;
        this.folded = false;
        this.active = true;
        this.stop = false;
    }
}

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
}

// Message represents a message sent between client and server
class Message {
    constructor(type, payload) {
        this.type = type;
        this.payload = payload;
    }
}

// Action represents a player action
class Action {
    constructor(type, amount) {
        this.type = type;
        this.amount = amount;
    }
}

const games = new Map();
const lastHeartbeats = new Map();

const writeWait = 10000; // 10 seconds
const pongWait = 60000; // 60 seconds
const pingPeriod = (pongWait * 9) / 10;
const maxMessageSize = 512;

// Creates a standard 52-card deck
function newDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push(new Card(suit, rank));
        }
    }
    return deck;
}

// Shuffles a given deck of cards randomly
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Generates a random alphanumeric ID
function generateID() {
    return uuidv4().slice(0, 8);
}

// Evaluates a poker hand and returns its rank and key cards
function evaluateHand(cards) {
    const rankValues = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };

    // Group cards by rank and suit
    const rankCounts = {};
    const suitCounts = {};
    cards.forEach(card => {
        rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    });

    const ranks = Object.keys(rankCounts).sort((a, b) => rankValues[b] - rankValues[a]);
    const isFlush = Object.values(suitCounts).some(count => count >= 5);
    const rankValuesSorted = cards.map(card => rankValues[card.rank]).sort((a, b) => b - a);

    // Check for straight
    let straightHigh = 0;
    const values = [...new Set(cards.map(card => rankValues[card.rank]))].sort((a, b) => b - a);
    if (values.includes(14)) values.push(1); // Ace-low straight
    for (let i = 0; i <= values.length - 5; i++) {
        if (values[i] - values[i + 4] === 4) {
            straightHigh = values[i];
            break;
        }
    }

    // Check hand types in order of strength
    if (isFlush && straightHigh && straightHigh === 14) {
        return { rank: 9, value: straightHigh, kickers: [] }; // Royal Flush
    }
    if (isFlush && straightHigh) {
        return { rank: 8, value: straightHigh, kickers: [] }; // Straight Flush
    }
    if (Object.values(rankCounts).includes(4)) {
        const quadRank = ranks.find(r => rankCounts[r] === 4);
        const kicker = ranks.filter(r => r !== quadRank)[0];
        return { rank: 7, value: rankValues[quadRank], kickers: [rankValues[kicker]] }; // Four of a Kind
    }
    if (Object.values(rankCounts).includes(3) && Object.values(rankCounts).includes(2)) {
        const tripsRank = ranks.find(r => rankCounts[r] === 3);
        const pairRank = ranks.find(r => rankCounts[r] === 2);
        return { rank: 6, value: rankValues[tripsRank], kickers: [rankValues[pairRank]] }; // Full House
    }
    if (isFlush) {
        const flushCards = cards.filter(card => suitCounts[card.suit] >= 5)
            .map(card => rankValues[card.rank])
            .sort((a, b) => b - a)
            .slice(0, 5);
        return { rank: 5, value: flushCards[0], kickers: flushCards.slice(1) }; // Flush
    }
    if (straightHigh) {
        return { rank: 4, value: straightHigh, kickers: [] }; // Straight
    }
    if (Object.values(rankCounts).includes(3)) {
        const tripsRank = ranks.find(r => rankCounts[r] === 3);
        const kickers = ranks.filter(r => rankCounts[r] < 3).slice(0, 2).map(r => rankValues[r]);
        return { rank: 3, value: rankValues[tripsRank], kickers }; // Three of a Kind
    }
    if (Object.values(rankCounts).filter(count => count === 2).length >= 2) {
        const pairs = ranks.filter(r => rankCounts[r] === 2).slice(0, 2);
        const kicker = ranks.filter(r => rankCounts[r] === 1)[0];
        return { rank: 2, value: rankValues[pairs[0]], kickers: [rankValues[pairs[1]], rankValues[kicker]] }; // Two Pair
    }
    if (Object.values(rankCounts).includes(2)) {
        const pairRank = ranks.find(r => rankCounts[r] === 2);
        const kickers = ranks.filter(r => rankCounts[r] === 1).slice(0, 3).map(r => rankValues[r]);
        return { rank: 1, value: rankValues[pairRank], kickers }; // One Pair
    }
    return { rank: 0, value: rankValuesSorted[0], kickers: rankValuesSorted.slice(1, 5) }; // High Card
}

// Compares two poker hands
function compareHands(hand1, hand2) {
    if (hand1.rank !== hand2.rank) return hand1.rank - hand2.rank;
    if (hand1.value !== hand2.value) return hand1.value - hand2.value;
    for (let i = 0; i < Math.min(hand1.kickers.length, hand2.kickers.length); i++) {
        if (hand1.kickers[i] !== hand2.kickers[i]) return hand1.kickers[i] - hand2.kickers[i];
    }
    return 0;
}

// Generates all possible 5-card combinations
function getCombinations(cards, k) {
    const result = [];
    function combine(current, start, k) {
        if (current.length === k) {
            result.push([...current]);
            return;
        }
        for (let i = start; i < cards.length; i++) {
            current.push(cards[i]);
            combine(current, i + 1, k);
            current.pop();
        }
    }
    combine([], 0, k);
    return result;
}

// Deals two hole cards to each active player
Game.prototype.dealHoleCards = function () {
    for (const player of this.players) {
        if (player.active) {
            if (this.deck.length < 2) {
                console.log(`Error: Not enough cards in deck for player ${player.id}. Reshuffling.`);
                this.deck = shuffleDeck(newDeck());
            }
            player.holeCards = [this.deck.shift(), this.deck.shift()];
        }
    }
};

// Deals the specified number of community cards
Game.prototype.dealCommunityCards = function (count) {
    if (this.deck.length < count) {
        console.log(`Error: Not enough cards to deal ${count} community cards. Reshuffling.`);
        this.deck = shuffleDeck(newDeck());
    }
    for (let i = 0; i < count; i++) {
        this.communityCards.push(this.deck.shift());
    }
};

// Initializes a new round of poker
Game.prototype.startRound = function () {
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
};

// Processes a player's action
Game.prototype.processAction = function (playerID, action) {
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
                sendErrorMessage(player.conn, 'Cannot check, there’s an active bet.');
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
                console.log(`Game ${this.id}: Invalid bet from ${player.name}. There’s already a bet of ${highestBet}.`);
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
};

// Moves to the next active, non-folded player
Game.prototype.moveToNextPlayer = function () {
    const initialTurn = this.currentTurn;
    do {
        this.currentTurn = (this.currentTurn + 1) % this.players.length;
        const player = this.players[this.currentTurn];
        if (player.active && !player.folded && player.chips > 0) {
            break;
        }
    } while (this.currentTurn !== initialTurn);
    console.log(`Game ${this.id}: Turn moved to ${this.players[this.currentTurn].name}.`);
};

// Checks if the current betting round is finished
Game.prototype.isBettingRoundComplete = function () {
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
};

// Advances game to the next street
Game.prototype.advanceGameState = function () {
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
};

// Determines the winner(s) of the hand
Game.prototype.determineWinner = function () {
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
};

// Helper function to get hand rank name
function getHandRankName(rank) {
    const rankNames = [
        'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
        'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
    ];
    return rankNames[rank] || 'Unknown';
}

// Broadcasts game state to all active players
Game.prototype.broadcastGameState = function () {
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
};

// Creates a filtered view of players, hiding other players' hole cards
Game.prototype.getPlayersView = function (viewerID) {
    return this.players.map(player => {
        const playerCopy = { ...player };
        if (playerCopy.id !== viewerID && this.state !== 'showdown') {
            playerCopy.holeCards = [];
        }
        delete playerCopy.conn;
        delete playerCopy.stop;
        return playerCopy;
    });
};

// Removes inactive players from the game
Game.prototype.cleanUpInactivePlayers = function () {
    this.players = this.players.filter(p => p.active);
    console.log(`Game ${this.id}: Current active players: ${this.players.length}`);
    if (this.players.length < 2 && this.state !== 'waiting') {
        console.log(`Game ${this.id}: Not enough active players (${this.players.length}). Resetting to 'waiting' state.`);
        this.state = 'waiting';
        this.deck = shuffleDeck(newDeck());
        this.communityCards = [];
        this.pot = 0;
    }
};

// Sends an error message to a client
function sendErrorMessage(conn, message) {
    const errMsg = new Message('error', { message });
    try {
        conn.send(JSON.stringify(errMsg));
    } catch (err) {
        console.log(`Error sending error message: ${err}`);
    }
}

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
}

wss.on('connection', ws => {
    const player = new Player(generateID(), `Player_${generateID().slice(0, 4)}`, ws);
    let game;

    // Find or create a game
    for (const [_, g] of games) {
        if (g.state === 'waiting' && g.players.length < 9) {
            game = g;
            break;
        }
    }
    if (!game) {
        game = new Game();
        games.set(game.id, game);
    }

    game.players.push(player);
    console.log(`Player ${player.name} (ID: ${player.id}) joined game ${game.id}`);

    if (game.players.length >= 2 && game.state === 'waiting') {
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
                const chatMsg = new Message('chat', {
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
});

// Serve static files
app.use(express.static('static'));

// Start server
server.listen(8080, () => {
    console.log('Server starting on :8080');
});