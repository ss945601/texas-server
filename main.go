package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mitchellh/mapstructure"
)

// Card represents a playing card
type Card struct {
	Suit string `json:"suit"`
	Rank string `json:"rank"`
}

// Player represents a poker player
type Player struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Conn      *websocket.Conn `json:"-"`
	HoleCards []Card          `json:"holeCards"`
	Chips     int             `json:"chips"`
	Bet       int             `json:"bet"`
	Folded    bool            `json:"folded"`
	Active    bool            `json:"active"` // Indicates if the player is currently connected and participating
	// A channel to signal that the player's connection handler should stop
	stop chan struct{} `json:"-"`
}

// Game represents a poker game
type Game struct {
	ID             string     `json:"id"`
	Players        []*Player  `json:"players"`
	Deck           []Card     `json:"-"`
	CommunityCards []Card     `json:"communityCards"`
	Pot            int        `json:"pot"`
	CurrentTurn    int        `json:"currentTurn"`
	Dealer         int        `json:"dealer"`
	SmallBlind     int        `json:"smallBlind"`
	BigBlind       int        `json:"bigBlind"`
	State          string     `json:"state"` // "waiting", "preflop", "flop", "turn", "river", "showdown"
	Mutex          sync.Mutex `json:"-"`     // Mutex to protect concurrent access to game state
	// WaitGroup to wait for all player goroutines to finish when the game ends
	playerWg sync.WaitGroup `json:"-"`
}

// Message represents a message sent between client and server
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Action represents a player action
type Action struct {
	Type   string `json:"type"` // "fold", "check", "call", "bet", "raise"
	Amount int    `json:"amount"`
}

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			// Allow all connections for simplicity.
			// In a production environment, you should restrict this to your actual client origins.
			return true
		},
	}

	games      = make(map[string]*Game)
	gamesMutex sync.Mutex // Mutex to protect concurrent access to the 'games' map
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

func init() {
	// Seed the random number generator
	rand.Seed(time.Now().UnixNano())
}

// newDeck creates and returns a standard 52-card deck.
func newDeck() []Card {
	suits := []string{"hearts", "diamonds", "clubs", "spades"}
	ranks := []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"}

	deck := make([]Card, 0, len(suits)*len(ranks))
	for _, suit := range suits {
		for _, rank := range ranks {
			deck = append(deck, Card{Suit: suit, Rank: rank})
		}
	}
	return deck
}

// shuffleDeck shuffles a given deck of cards randomly.
func shuffleDeck(deck []Card) []Card {
	shuffled := make([]Card, len(deck))
	copy(shuffled, deck)

	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	return shuffled
}

// newGame creates and returns a new poker game.
func newGame() *Game {
	game := &Game{
		ID:             generateID(),
		Players:        make([]*Player, 0),
		Deck:           shuffleDeck(newDeck()),
		CommunityCards: make([]Card, 0),
		Pot:            0,
		CurrentTurn:    0,
		Dealer:         0,
		SmallBlind:     5,
		BigBlind:       10,
		State:          "waiting",
	}

	gamesMutex.Lock()
	games[game.ID] = game
	gamesMutex.Unlock()

	log.Printf("New game created: %s", game.ID)
	return game
}

// generateID generates a random alphanumeric ID.
func generateID() string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 8)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// dealHoleCards deals two hole cards to each active player.
func (g *Game) dealHoleCards() {
	for _, player := range g.Players {
		if player.Active {
			if len(g.Deck) < 2 {
				log.Printf("Error: Not enough cards in deck to deal hole cards for player %s. Reshuffling.", player.ID)
				g.Deck = shuffleDeck(newDeck()) // Reshuffle if deck runs out prematurely (shouldn't happen with 52 cards and few players)
			}
			player.HoleCards = append(player.HoleCards, g.Deck[0])
			g.Deck = g.Deck[1:]
			player.HoleCards = append(player.HoleCards, g.Deck[0])
			g.Deck = g.Deck[1:]
		}
	}
}

// dealCommunityCards deals the specified number of community cards.
func (g *Game) dealCommunityCards(count int) {
	if len(g.Deck) < count {
		log.Printf("Error: Not enough cards in deck to deal %d community cards. Reshuffling.", count)
		g.Deck = shuffleDeck(newDeck()) // Reshuffle if deck runs out prematurely
	}
	for i := 0; i < count; i++ {
		g.CommunityCards = append(g.CommunityCards, g.Deck[0])
		g.Deck = g.Deck[1:]
	}
}

// startRound initializes a new round of poker.
func (g *Game) startRound() {
	g.Mutex.Lock()
	defer g.Mutex.Unlock()

	log.Printf("Game %s: Starting new round.", g.ID)

	// Ensure at least two active players to start a round
	activePlayers := 0
	for _, p := range g.Players {
		if p.Active {
			activePlayers++
		}
	}
	if activePlayers < 2 {
		log.Printf("Game %s: Not enough active players (%d) to start a round. Waiting for more players.", g.ID, activePlayers)
		g.State = "waiting"
		g.broadcastGameState()
		return
	}

	// Reset game state
	g.Deck = shuffleDeck(newDeck())
	g.CommunityCards = make([]Card, 0)
	g.Pot = 0
	g.State = "preflop"

	// Move dealer button
	g.Dealer = (g.Dealer + 1) % len(g.Players)
	// Ensure the dealer is an active player
	for !g.Players[g.Dealer].Active {
		g.Dealer = (g.Dealer + 1) % len(g.Players)
	}

	// Reset player states
	for _, player := range g.Players {
		player.HoleCards = make([]Card, 0)
		player.Bet = 0
		player.Folded = false
		// Only set player to active if they are still connected (already handled by handleConnection cleanup)
	}

	// Post blinds
	// Find active small blind and big blind positions
	var smallBlindPlayer, bigBlindPlayer *Player
	var smallBlindPos, bigBlindPos int

	// Find Small Blind
	smallBlindPos = (g.Dealer + 1) % len(g.Players)
	for !g.Players[smallBlindPos].Active {
		smallBlindPos = (smallBlindPos + 1) % len(g.Players)
	}
	smallBlindPlayer = g.Players[smallBlindPos]

	// Find Big Blind
	bigBlindPos = (smallBlindPos + 1) % len(g.Players)
	for !g.Players[bigBlindPos].Active {
		bigBlindPos = (bigBlindPos + 1) % len(g.Players)
	}
	bigBlindPlayer = g.Players[bigBlindPos]

	// Handle cases where a player might not have enough chips for the blinds
	smallBlindAmount := min(g.SmallBlind, smallBlindPlayer.Chips)
	smallBlindPlayer.Bet = smallBlindAmount
	smallBlindPlayer.Chips -= smallBlindAmount
	g.Pot += smallBlindAmount
	log.Printf("Game %s: %s posted small blind of %d", g.ID, smallBlindPlayer.Name, smallBlindAmount)

	bigBlindAmount := min(g.BigBlind, bigBlindPlayer.Chips)
	bigBlindPlayer.Bet = bigBlindAmount
	bigBlindPlayer.Chips -= bigBlindAmount
	g.Pot += bigBlindAmount
	log.Printf("Game %s: %s posted big blind of %d", g.ID, bigBlindPlayer.Name, bigBlindAmount)

	// Set current turn to player after big blind
	g.CurrentTurn = (bigBlindPos + 1) % len(g.Players)
	for !g.Players[g.CurrentTurn].Active { // Skip inactive players
		g.CurrentTurn = (g.CurrentTurn + 1) % len(g.Players)
	}

	// Deal hole cards
	g.dealHoleCards()

	// Broadcast game state
	g.broadcastGameState()
	log.Printf("Game %s: Round started. State: %s", g.ID, g.State)
}

// processAction processes a player's action (fold, check, call, bet, raise).
func (g *Game) processAction(playerID string, action Action) {
	g.Mutex.Lock()
	defer g.Mutex.Unlock()

	// Find player
	playerIndex := -1
	var player *Player
	for i, p := range g.Players {
		if p.ID == playerID {
			playerIndex = i
			player = p
			break
		}
	}

	if player == nil {
		log.Printf("Game %s: Action from unknown player ID: %s", g.ID, playerID)
		return // Player not found
	}
	if !player.Active {
		log.Printf("Game %s: Inactive player %s attempted action.", g.ID, player.Name)
		return // Inactive player
	}
	if player.Folded {
		log.Printf("Game %s: Folded player %s attempted action.", g.ID, player.Name)
		return // Player already folded
	}

	// Check if it's player's turn
	if playerIndex != g.CurrentTurn {
		log.Printf("Game %s: It's not %s's turn.", g.ID, player.Name)
		// Optionally, send an error message back to the client
		sendErrorMessage(player.Conn, "Not your turn.")
		return
	}

	highestBet := 0
	for _, p := range g.Players {
		if p.Active && p.Bet > highestBet {
			highestBet = p.Bet
		}
	}

	// Process action based on type
	switch action.Type {
	case "fold":
		player.Folded = true
		log.Printf("Game %s: Player %s folded.", g.ID, player.Name)

	case "check":
		// Check is only valid if the player's current bet matches the highest bet (i.e., no one has raised)
		if player.Bet < highestBet {
			log.Printf("Game %s: Invalid check from %s. Highest bet is %d, %s's bet is %d.", g.ID, player.Name, highestBet, player.Name, player.Bet)
			sendErrorMessage(player.Conn, "Cannot check, there's an active bet.")
			return // Invalid action
		}
		log.Printf("Game %s: Player %s checked.", g.ID, player.Name)

	case "call":
		amountToCall := highestBet - player.Bet
		if amountToCall <= 0 {
			log.Printf("Game %s: Invalid call from %s. No amount to call.", g.ID, player.Name)
			sendErrorMessage(player.Conn, "No amount to call.")
			return // Invalid action
		}
		if amountToCall > player.Chips {
			amountToCall = player.Chips // All-in
			log.Printf("Game %s: Player %s went all-in for %d (calling).", g.ID, player.Name, amountToCall)
		} else {
			log.Printf("Game %s: Player %s called %d.", g.ID, player.Name, amountToCall)
		}

		player.Chips -= amountToCall
		player.Bet += amountToCall
		g.Pot += amountToCall

	case "bet":
		// A bet can only be made if no one has bet yet in this street (highestBet is 0 or player's current bet)
		if highestBet > player.Bet {
			log.Printf("Game %s: Invalid bet from %s. There's already a bet of %d.", g.ID, player.Name, highestBet)
			sendErrorMessage(player.Conn, "Cannot bet, someone has already bet. You must call or raise.")
			return
		}
		if action.Amount <= 0 || action.Amount > player.Chips {
			log.Printf("Game %s: Invalid bet amount %d from %s.", g.ID, action.Amount, player.Name)
			sendErrorMessage(player.Conn, "Invalid bet amount.")
			return // Invalid action
		}
		if action.Amount < g.BigBlind && g.State == "preflop" { // Minimum bet rule
			log.Printf("Game %s: Invalid bet amount %d from %s. Must be at least big blind %d.", g.ID, action.Amount, player.Name, g.BigBlind)
			sendErrorMessage(player.Conn, "Bet must be at least the big blind.")
			return
		}
		if action.Amount < highestBet { // Ensure bet is at least the highest current bet
			log.Printf("Game %s: Invalid bet amount %d from %s. Must be at least the current bet %d.", g.ID, action.Amount, player.Name, highestBet)
			sendErrorMessage(player.Conn, "Your bet must be at least the current highest bet.")
			return
		}

		player.Chips -= action.Amount
		player.Bet += action.Amount
		g.Pot += action.Amount
		log.Printf("Game %s: Player %s bet %d.", g.ID, player.Name, action.Amount)

	case "raise":
		// A raise means increasing the highest bet
		if action.Amount <= 0 || action.Amount > player.Chips {
			log.Printf("Game %s: Invalid raise amount %d from %s.", g.ID, action.Amount, player.Name)
			sendErrorMessage(player.Conn, "Invalid raise amount.")
			return // Invalid action
		}

		// The amount to raise by is the difference between the new total bet and the highest current bet.
		// The total new bet (player.Bet + action.Amount) must be at least (highestBet + minimum_raise_increment).
		// A common rule is that a raise must be at least the size of the previous bet or raise.
		// For simplicity here, let's assume a raise must at least double the current highest bet, or be a specified minimum raise.
		minRaiseIncrement := highestBet - player.Bet  // This is the amount the last player bet/raised
		if minRaiseIncrement == 0 && highestBet > 0 { // If current player is calling a bet, then the min raise is that bet amount
			minRaiseIncrement = highestBet
		} else if minRaiseIncrement == 0 { // If no one has bet yet, min raise is big blind
			minRaiseIncrement = g.BigBlind
		}

		totalNewBet := player.Bet + action.Amount
		if totalNewBet < highestBet+minRaiseIncrement {
			log.Printf("Game %s: Invalid raise from %s. Total bet %d is less than required %d (current highest %d + min increment %d).",
				g.ID, player.Name, totalNewBet, highestBet+minRaiseIncrement, highestBet, minRaiseIncrement)
			sendErrorMessage(player.Conn, "Invalid raise amount. Must be at least the previous raise increment.")
			return // Invalid action
		}

		player.Chips -= action.Amount
		player.Bet += action.Amount
		g.Pot += action.Amount
		log.Printf("Game %s: Player %s raised by %d to a total of %d.", g.ID, player.Name, action.Amount, player.Bet)

	default:
		log.Printf("Game %s: Unknown action type '%s' from player %s", g.ID, action.Type, player.Name)
		sendErrorMessage(player.Conn, "Unknown action type.")
		return
	}

	// Move to next player
	g.moveToNextPlayer()

	// Check if betting round is complete
	if g.isBettingRoundComplete() {
		log.Printf("Game %s: Betting round complete. Advancing game state.", g.ID)
		g.advanceGameState()
	}

	// Broadcast game state
	g.broadcastGameState()
}

// moveToNextPlayer moves the current turn to the next active, non-folded player.
func (g *Game) moveToNextPlayer() {
	initialTurn := g.CurrentTurn
	for {
		g.CurrentTurn = (g.CurrentTurn + 1) % len(g.Players)
		player := g.Players[g.CurrentTurn]
		if player.Active && !player.Folded && player.Chips > 0 { // Player must be active, not folded, and have chips
			break
		}
		if g.CurrentTurn == initialTurn { // If we've circled back, it means only one player is left or everyone is all-in/folded
			break
		}
	}
	log.Printf("Game %s: Turn moved to %s.", g.ID, g.Players[g.CurrentTurn].Name)
}

// isBettingRoundComplete checks if the current betting round is finished.
func (g *Game) isBettingRoundComplete() bool {
	// Count active players (not folded, not all-in before current street, and connected)
	activePlayersInRound := 0
	highestBet := 0
	for _, player := range g.Players {
		if player.Active && !player.Folded {
			activePlayersInRound++
			if player.Bet > highestBet {
				highestBet = player.Bet
			}
		}
	}

	// If only one player remains active, the round is complete.
	if activePlayersInRound <= 1 {
		return true
	}

	// Check if all active players have matched the highest bet or are all-in.
	// Players who are all-in automatically complete their action for the round.
	for _, player := range g.Players {
		if player.Active && !player.Folded {
			// If a player hasn't matched the highest bet and isn't all-in, the round is not complete.
			if player.Bet < highestBet && player.Chips > 0 {
				return false
			}
			// If it's the current player's turn and they haven't acted yet (e.g., first to act after a raise),
			// the round is not complete until they act. This needs careful handling with `moveToNextPlayer`.
			// The `moveToNextPlayer` already sets the `CurrentTurn` to the next player who needs to act.
			// So, if the current player is the one whose turn it is, and they can still act,
			// the round is not complete.
		}
	}

	// Check if everyone has acted since the last bet/raise.
	// This is trickier. A simpler way is to check if `CurrentTurn` points to someone
	// who has already acted or if all players have matched the highest bet or folded.
	// The `moveToNextPlayer` advances the turn. If the player at `CurrentTurn`
	// is the one who made the last bet/raise or has matched it, and no one else needs to act,
	// then the round is complete.
	// For simplicity, the check above (all active players matched highest bet or all-in)
	// combined with moving the turn is usually sufficient for standard play.
	return true
}

// advanceGameState moves the game to the next street (flop, turn, river, showdown) or ends the hand.
func (g *Game) advanceGameState() {
	switch g.State {
	case "preflop":
		g.State = "flop"
		g.dealCommunityCards(3)
		log.Printf("Game %s: Advanced to Flop. Community cards: %v", g.ID, g.CommunityCards)

	case "flop":
		g.State = "turn"
		g.dealCommunityCards(1)
		log.Printf("Game %s: Advanced to Turn. Community cards: %v", g.ID, g.CommunityCards)

	case "turn":
		g.State = "river"
		g.dealCommunityCards(1)
		log.Printf("Game %s: Advanced to River. Community cards: %v", g.ID, g.CommunityCards)

	case "river":
		g.State = "showdown"
		log.Printf("Game %s: Advanced to Showdown.", g.ID)
		g.determineWinner()

	case "showdown":
		// Start a new round after a delay
		log.Printf("Game %s: Showdown complete. Starting new round in 5 seconds.", g.ID)
		time.AfterFunc(5*time.Second, func() {
			g.startRound()
		})
		return // Return early as startRound will broadcast game state
	}

	// Reset bets for the new street
	if g.State != "showdown" {
		for _, player := range g.Players {
			player.Bet = 0 // Clear bets for the new street
		}

		// Set current turn to player after dealer for the new street
		g.CurrentTurn = (g.Dealer + 1) % len(g.Players)
		// Skip folded or inactive players until an active player is found
		for !g.Players[g.CurrentTurn].Active || g.Players[g.CurrentTurn].Folded || g.Players[g.CurrentTurn].Chips == 0 {
			g.CurrentTurn = (g.CurrentTurn + 1) % len(g.Players)
			// If we loop through all players and can't find an active one,
			// it means everyone else is folded/all-in. This case should ideally
			// lead to ending the hand and determining winner.
			// This scenario is handled by `isBettingRoundComplete` which would have already
			// advanced to showdown if only one player remains active.
		}
		log.Printf("Game %s: New street, current turn set to %s.", g.ID, g.Players[g.CurrentTurn].Name)
	}
	g.broadcastGameState() // Broadcast after advancing state and resetting for next street
}

// determineWinner determines the winner(s) of the hand and awards the pot.
// This function needs a proper poker hand evaluator for a real game.
func (g *Game) determineWinner() {
	// --- Placeholder: Implement a proper poker hand evaluator here ---
	// For simplicity, just pick a random winner from active players.
	// In a real implementation, you would evaluate poker hands using CommunityCards and each player's HoleCards.
	// This would involve:
	// 1. Combining hole cards with community cards for each active player.
	// 2. Evaluating the best 5-card poker hand for each player.
	// 3. Comparing hands to determine the winner(s) and split the pot if necessary.
	// ------------------------------------------------------------------

	activePlayerIndices := make([]int, 0)
	for i, player := range g.Players {
		if player.Active && !player.Folded {
			activePlayerIndices = append(activePlayerIndices, i)
		}
	}

	if len(activePlayerIndices) > 0 {
		winnerIndex := activePlayerIndices[rand.Intn(len(activePlayerIndices))]
		winner := g.Players[winnerIndex]
		winner.Chips += g.Pot // Award full pot to the "winner"
		log.Printf("Game %s: Winner determined: %s (ID: %s) won %d chips.", g.ID, winner.Name, winner.ID, g.Pot)

		// Broadcast winner information to all active players
		msg := Message{
			Type: "winner",
			Payload: map[string]interface{}{
				"playerID":   winner.ID,
				"playerName": winner.Name,
				"amount":     g.Pot,
			},
		}

		for _, p := range g.Players {
			if p.Active {
				if err := p.Conn.WriteJSON(msg); err != nil {
					log.Printf("Error sending winner message to %s: %v", p.Name, err)
					// Handle potential disconnection during broadcast
					p.Active = false
					close(p.stop) // Signal to stop this player's read/write goroutines
				}
			}
		}
		g.Pot = 0 // Reset pot after awarding
	} else {
		log.Printf("Game %s: No active players to determine a winner. Pot %d pushed.", g.ID, g.Pot)
		// No winner, pot might be split or pushed to next hand (depending on rules)
		// For now, just reset pot to 0.
		g.Pot = 0
	}
}

// broadcastGameState sends the current game state to all active players.
func (g *Game) broadcastGameState() {
	g.Mutex.Lock() // Ensure exclusive access to game state while preparing broadcast
	defer g.Mutex.Unlock()

	for _, player := range g.Players {
		if player.Active {
			// Create a view of the game state for this specific player
			// This ensures players don't see other players' hole cards until showdown.
			gameView := struct {
				ID             string    `json:"id"`
				Players        []*Player `json:"players"`
				CommunityCards []Card    `json:"communityCards"`
				Pot            int       `json:"pot"`
				CurrentTurn    int       `json:"currentTurn"` // Index of the player whose turn it is
				Dealer         int       `json:"dealer"`      // Index of the dealer player
				SmallBlind     int       `json:"smallBlind"`
				BigBlind       int       `json:"bigBlind"`
				State          string    `json:"state"`
				YourTurn       bool      `json:"yourTurn"`
			}{
				ID:             g.ID,
				Players:        g.getPlayersView(player.ID), // Filter players data
				CommunityCards: g.CommunityCards,
				Pot:            g.Pot,
				CurrentTurn:    g.CurrentTurn,
				Dealer:         g.Dealer,
				SmallBlind:     g.SmallBlind,
				BigBlind:       g.BigBlind,
				State:          g.State,
				YourTurn:       g.Players[g.CurrentTurn].ID == player.ID,
			}

			msg := Message{
				Type:    "gameState",
				Payload: gameView,
			}

			// Using a goroutine for WriteJSON to avoid blocking the game logic.
			// This can lead to out-of-order messages if not handled carefully,
			// but for broadcasts, it's generally acceptable.
			// For critical messages, direct synchronous write is preferred or
			// a dedicated write goroutine per connection.
			err := player.Conn.WriteJSON(msg)
			if err != nil {
				log.Printf("Error sending game state to %s: %v", player.Name, err)
				// If an error occurs, assume the player has disconnected
				player.Active = false
				close(player.stop) // Signal the player's handler to stop
			}
		}
	}
	g.cleanUpInactivePlayers() // Clean up disconnected players after broadcasting
}

// getPlayersView creates a filtered view of players for a specific player,
// hiding other players' hole cards unless in showdown.
func (g *Game) getPlayersView(viewerID string) []*Player {
	playersView := make([]*Player, len(g.Players))

	for i, player := range g.Players {
		// Create a copy of the player to modify for the view
		playerCopy := *player

		// Hide hole cards of other players unless in showdown
		if playerCopy.ID != viewerID && g.State != "showdown" {
			playerCopy.HoleCards = make([]Card, 0)
		}

		// Remove sensitive/unnecessary fields from the view
		playerCopy.Conn = nil
		playerCopy.stop = nil

		playersView[i] = &playerCopy
	}
	return playersView
}

// cleanUpInactivePlayers removes players marked as inactive from the game.
func (g *Game) cleanUpInactivePlayers() {
	g.Mutex.Lock()
	defer g.Mutex.Unlock()

	var activePlayers []*Player
	for _, p := range g.Players {
		if p.Active {
			activePlayers = append(activePlayers, p)
		} else {
			log.Printf("Game %s: Removing inactive player %s (ID: %s).", g.ID, p.Name, p.ID)
		}
	}
	g.Players = activePlayers

	// If the number of active players drops below 2, the game should reset or end
	if len(g.Players) < 2 && g.State != "waiting" {
		log.Printf("Game %s: Not enough active players (%d). Resetting game to 'waiting' state.", g.ID, len(g.Players))
		g.State = "waiting"
		// Potentially clear community cards, reset deck, etc.
		g.Deck = shuffleDeck(newDeck())
		g.CommunityCards = make([]Card, 0)
		g.Pot = 0
		// You might want to redistribute chips or end the game entirely here
	}
	log.Printf("Game %s: Current active players: %d", g.ID, len(g.Players))
}

// handleConnection manages a single WebSocket connection for a player.
func handleConnection(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	player := &Player{
		ID:        generateID(),
		Name:      "Player " + generateID()[:4],
		Conn:      conn,
		HoleCards: make([]Card, 0),
		Chips:     1000,
		Bet:       0,
		Folded:    false,
		Active:    true,
		stop:      make(chan struct{}), // Initialize the stop channel
	}

	// Find an existing game or create a new one
	var game *Game
	gamesMutex.Lock()
	for _, g := range games {
		if g.State == "waiting" && len(g.Players) < 9 { // Max 9 players for a typical poker table
			game = g
			break
		}
	}

	if game == nil {
		game = newGame()
	}
	gamesMutex.Unlock()

	// Add player to game
	game.Mutex.Lock()
	game.Players = append(game.Players, player)
	game.playerWg.Add(1) // Increment WaitGroup for this player's goroutine
	log.Printf("Player %s (ID: %s) joined game %s.", player.Name, player.ID, game.ID)

	// If we have enough players, start the game
	if len(game.Players) >= 2 && game.State == "waiting" {
		log.Printf("Game %s: Enough players (%d) to start. Initiating first round.", game.ID, len(game.Players))
		go game.startRound() // Start the game in a new goroutine
	}
	game.Mutex.Unlock()

	// Send welcome message to the new player
	welcomeMsg := Message{
		Type: "welcome",
		Payload: map[string]string{
			"playerID":   player.ID,
			"playerName": player.Name,
			"gameID":     game.ID,
		},
	}
	if err := conn.WriteJSON(welcomeMsg); err != nil {
		log.Printf("Error sending welcome message to %s: %v", player.Name, err)
		player.Active = false // Mark player as inactive if welcome message fails
		game.cleanUpInactivePlayers()
		return
	}

	// Set up ping-pong handlers for heartbeat
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		// Update read deadline and last heartbeat time on pong
		conn.SetReadDeadline(time.Now().Add(pongWait))
		updateLastHeartbeat(player.ID) // Update the last heartbeat time on pong
		log.Printf("Received pong from player %s.", player.Name)
		return nil
	})

	// Start goroutine to send pings
	go pingSender(conn, player.stop, player.ID)

	// Handle incoming messages from the client
	for {
		select {
		case <-player.stop: // Check if we should stop
			log.Printf("Player %s (ID: %s) read loop stopping.", player.Name, player.ID)
			return
		default:
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("Player %s (ID: %s) disconnected unexpectedly: %v", player.Name, player.ID, err)
				} else {
					log.Printf("Player %s (ID: %s) read error: %v", player.Name, player.ID, err)
				}
				// Mark player as inactive and signal cleanup
				game.Mutex.Lock()
				player.Active = false
				game.Mutex.Unlock()
				close(player.stop) // Signal ping sender to stop
				return
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("Error unmarshaling message from %s: %v", player.Name, err)
				// Optionally, send an error message back to the client
				sendErrorMessage(player.Conn, "Invalid message format.")
				continue
			}

			switch msg.Type {
			case "action":
				var action Action
				// Directly unmarshal Payload into Action
				if err := mapstructure.Decode(msg.Payload, &action); err != nil {
					log.Printf("Error decoding action payload from %s: %v", player.Name, err)
					sendErrorMessage(player.Conn, "Invalid action data.")
					continue
				}
				game.processAction(player.ID, action)

			case "chat":
				// Ensure payload is a string for chat messages
				chatContent, ok := msg.Payload.(string)
				if !ok {
					log.Printf("Invalid chat message payload type from %s: %T", player.Name, msg.Payload)
					sendErrorMessage(player.Conn, "Invalid chat message format.")
					continue
				}

				chatMsg := Message{
					Type: "chat",
					Payload: map[string]interface{}{
						"playerID":   player.ID,
						"playerName": player.Name,
						"message":    chatContent,
					},
				}

				// Broadcast chat message to all active players in the game
				game.Mutex.Lock()
				for _, p := range game.Players {
					if p.Active {
						if err := p.Conn.WriteJSON(chatMsg); err != nil {
							log.Printf("Error sending chat message to %s: %v", p.Name, err)
							// Handle potential disconnection during broadcast
							p.Active = false
							close(p.stop) // Signal to stop this player's read/write goroutines
						}
					}
				}
				game.Mutex.Unlock()

			case "heartbeat":
				// Client sent a heartbeat, update the read deadline and lastHeartbeat time
				conn.SetReadDeadline(time.Now().Add(pongWait))
				updateLastHeartbeat(player.ID) // Update the last heartbeat time
				log.Printf("Received heartbeat from player %s.", player.Name)

				// Send a heartbeat response back to the client
				heartbeatResponse := Message{
					Type: "heartbeat_ack",
					Payload: map[string]interface{}{
						"timestamp": time.Now().UnixNano() / int64(time.Millisecond),
						"status":    "ok",
					},
				}

				if err := conn.WriteJSON(heartbeatResponse); err != nil {
					log.Printf("Error sending heartbeat response to %s: %v", player.Name, err)
				}

			default:
				log.Printf("Unknown message type '%s' from player %s (ID: %s)", msg.Type, player.Name, player.ID)
				sendErrorMessage(player.Conn, "Unknown message type.")
			}
		}
	}
}

// Player's last heartbeat time, protected by a mutex
var (
	heartbeatMutex sync.Mutex
	lastHeartbeats = make(map[string]time.Time)
)

// updateLastHeartbeat updates the last heartbeat time for a player
func updateLastHeartbeat(playerID string) {
	heartbeatMutex.Lock()
	lastHeartbeats[playerID] = time.Now()
	heartbeatMutex.Unlock()
}

// getLastHeartbeat gets the last heartbeat time for a player
func getLastHeartbeat(playerID string) time.Time {
	heartbeatMutex.Lock()
	defer heartbeatMutex.Unlock()

	lastTime, ok := lastHeartbeats[playerID]
	if !ok {
		// If no heartbeat recorded yet, use current time
		lastTime = time.Now()
		lastHeartbeats[playerID] = lastTime
	}

	return lastTime
}

// pingSender sends ping messages to the client to keep the connection alive.
func pingSender(conn *websocket.Conn, stop chan struct{}, playerID string) {
	ticker := time.NewTicker(pingPeriod)
	// Initialize the last heartbeat time
	updateLastHeartbeat(playerID)

	defer func() {
		ticker.Stop()
		conn.Close() // Close connection when ping sender stops
		log.Printf("Ping sender for player %s stopping.", playerID)

		// Clean up the heartbeat entry
		heartbeatMutex.Lock()
		delete(lastHeartbeats, playerID)
		heartbeatMutex.Unlock()
	}()

	for {
		select {
		case <-ticker.C:
			// Check if we haven't received a heartbeat in too long
			lastHB := getLastHeartbeat(playerID)
			if time.Since(lastHB) > pongWait {
				log.Printf("No heartbeat received from player %s in %v, closing connection", playerID, pongWait)
				return
			}

			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Ping error for player %s: %v", playerID, err)
				return // Stop the goroutine on write error
			}
		case <-stop: // Received stop signal from the main handler
			return
		}
	}
}

// sendErrorMessage sends a structured error message back to a specific client.
func sendErrorMessage(conn *websocket.Conn, message string) {
	errMsg := Message{
		Type:    "error",
		Payload: map[string]string{"message": message},
	}
	if err := conn.WriteJSON(errMsg); err != nil {
		log.Printf("Error sending error message: %v", err)
	}
}

// min helper function for calculating blind amounts
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	// Serve static files from the "static" directory
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// WebSocket endpoint
	http.HandleFunc("/ws", handleConnection)

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
