// Game state and logic

let playerID = '';
let playerName = '';
let gameState = {};

// Handle incoming messages
function handleMessage(message) {
    console.log('📥 Processing message:', message);
    
    switch(message.type) {
        case 'welcome':
            playerID = message.payload.playerID || '';
            playerName = message.payload.playerName || 'Unknown';
            document.getElementById('player-info').textContent = `You are ${playerName} - Chips: 1000`;
            addSystemMessage(`Joined game as ${playerName}`);
            break;
            
        case 'gameState':
            gameState = message.payload || {};
            updateGameState();
            break;
            
        case 'winner':
            showWinner(message.payload || {});
            break;
            
        case 'chat':
            addChatMessage(message.payload || {});
            break;
            
        case 'heartbeat_ack':
            console.log('💓 Received heartbeat acknowledgment');
            break;
            
        case 'error':
            console.error('🚫 Server error:', message.payload.message);
            addSystemMessage(`Server error: ${message.payload.message}`);
            break;
            
        default:
            console.log('⚠️ Unknown message type:', message.type);
            addSystemMessage(`Unknown message type: ${message.type}`);
    }
}

// Update the game state display
function updateGameState() {
    if (!gameState || !gameState.state) return;
    
    document.getElementById('game-state').textContent = `Game State: ${STATE_TEXT[gameState.state] || gameState.state}`;
    document.getElementById('pot').textContent = `Pot: $${gameState.pot || 0}`;
    
    if (gameState.smallBlind && gameState.bigBlind) {
        document.getElementById('blinds-info').textContent = `Blinds: $${gameState.smallBlind}/$${gameState.bigBlind}`;
    }
    
    const currentPlayer = gameState.players ? gameState.players.find(p => p.id === playerID) : null;
    if (currentPlayer) {
        document.getElementById('player-info').textContent = `You are ${playerName} - Chips: $${currentPlayer.chips}`;
    }
    
    // Update community cards
    const communityCardsContainer = document.getElementById('community-cards');
    communityCardsContainer.innerHTML = '';
    
    if (gameState.communityCards && gameState.communityCards.length > 0) {
        for (const card of gameState.communityCards) {
            communityCardsContainer.appendChild(createCardElement(card));
        }
        
        const remainingCards = 5 - gameState.communityCards.length;
        for (let i = 0; i < remainingCards; i++) {
            const placeholder = document.createElement('div');
            placeholder.className = 'card card-placeholder';
            communityCardsContainer.appendChild(placeholder);
        }
    } else {
        for (let i = 0; i < 5; i++) {
            const placeholder = document.createElement('div');
            placeholder.className = 'card card-placeholder';
            communityCardsContainer.appendChild(placeholder);
        }
    }
    
    // Update players
    const playersContainer = document.getElementById('players');
    playersContainer.innerHTML = '';
    
    if (gameState.players && gameState.players.length > 0) {
        // Find the current player's index
        const currentPlayerIndex = gameState.players.findIndex(p => p.id === playerID);
        
        // Reorder players so current player is first (position 1)
        const reorderedPlayers = [];
        
        if (currentPlayerIndex !== -1) {
            // Add players after current player
            for (let i = currentPlayerIndex; i < gameState.players.length; i++) {
                reorderedPlayers.push(gameState.players[i]);
            }
            
            // Add players before current player
            for (let i = 0; i < currentPlayerIndex; i++) {
                reorderedPlayers.push(gameState.players[i]);
            }
        } else {
            // If current player not found, use original order
            reorderedPlayers.push(...gameState.players);
        }
        
        reorderedPlayers.forEach((player, index) => {
            if (!player || !player.id) return;
            
            const playerElement = document.createElement('div');
            playerElement.className = 'player';
            
            // Check if this player has the current turn in the original array
            const originalIndex = gameState.players.findIndex(p => p.id === player.id);
            if (originalIndex === gameState.currentTurn) {
                playerElement.classList.add('current-turn');
            }
            
            if (player.folded) {
                playerElement.classList.add('folded');
            }
            
            if (player.id === playerID) {
                playerElement.style.borderColor = '#ffcc00';
                playerElement.style.borderWidth = '3px';
                playerElement.style.borderStyle = 'solid';
            }
            
            playerElement.innerHTML = `
                <div>${player.name || 'Unknown'} ${player.folded ? '(Folded)' : ''}</div>
                <div>Chips: $${player.chips || 0}</div>
                <div>Bet: $${player.bet || 0}</div>
            `;
            
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'player-cards';
            
            // Always show current player's cards face up
            if (player.holeCards && player.holeCards.length > 0 && (player.id === playerID || gameState.state === 'showdown')) {
                for (const card of player.holeCards) {
                    cardsContainer.appendChild(createCardElement(card));
                }
            } else {
                for (let i = 0; i < 2; i++) {
                    const cardBack = document.createElement('div');
                    cardBack.className = 'card';
                    cardBack.style.backgroundColor = '#0066cc';
                    cardBack.style.backgroundImage = 'repeating-linear-gradient(45deg, #0055aa, #0055aa 10px, #0066cc 10px, #0066cc 20px)';
                    cardsContainer.appendChild(cardBack);
                }
            }
            
            // Make current player's cards larger and more prominent
            if (player.id === playerID) {
                cardsContainer.classList.add('current-player-cards');
            }
            
            playerElement.appendChild(cardsContainer);
            playersContainer.appendChild(playerElement);
        });
    }
    
    document.getElementById('actions').style.display = 'flex';
    updateActionButtons();
}