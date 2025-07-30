// UI-related functions

// Create a card element
function createCardElement(card) {
    if (!card || !card.suit || !card.rank) return document.createElement('div');
    
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.suit}`;
    
    const topValue = document.createElement('div');
    topValue.className = 'card-value';
    topValue.textContent = RANK_DISPLAY[card.rank] || card.rank;
    
    const suitElement = document.createElement('div');
    suitElement.className = 'card-suit';
    suitElement.textContent = SUIT_SYMBOLS[card.suit] || card.suit;
    
    const bottomValue = document.createElement('div');
    bottomValue.className = 'card-value';
    bottomValue.textContent = RANK_DISPLAY[card.rank] || card.rank;
    
    cardElement.appendChild(topValue);
    cardElement.appendChild(suitElement);
    cardElement.appendChild(bottomValue);
    
    return cardElement;
}

// Update connection status UI
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    const textElement = document.getElementById('connection-text');
    
    statusElement.className = 'connection-status';
    
    switch(status) {
        case 'connected':
            statusElement.classList.add('connected');
            textElement.textContent = 'Connected';
            textElement.style.color = '#33cc33';
            break;
        case 'disconnected':
            statusElement.classList.add('disconnected');
            textElement.textContent = 'Disconnected';
            textElement.style.color = '#ff3333';
            break;
        case 'connecting':
            statusElement.classList.add('connecting');
            textElement.textContent = 'Connecting...';
            textElement.style.color = '#ffcc00';
            break;
    }
}

// Reset game UI on disconnection
function resetGameUI() {
    document.getElementById('game-state').textContent = 'Waiting for connection...';
    document.getElementById('player-info').textContent = 'Connecting...';
    document.getElementById('pot').textContent = 'Pot: $0';
    
    const communityCardsContainer = document.getElementById('community-cards');
    communityCardsContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'card card-placeholder';
        communityCardsContainer.appendChild(placeholder);
    }
    
    document.getElementById('players').innerHTML = '';
    document.getElementById('actions').style.display = 'none';
    document.getElementById('winner-message').classList.add('hidden');
}

// Update action buttons based on game state
function updateActionButtons() {
    const actionsContainer = document.getElementById('actions');
    const foldBtn = document.getElementById('fold-btn');
    const checkBtn = document.getElementById('check-btn');
    const callBtn = document.getElementById('call-btn');
    const allInBtn = document.getElementById('all-in-btn');
    const betInput = document.getElementById('bet-amount');
    const betSlider = document.getElementById('bet-slider');
    const betBtn = document.getElementById('bet-btn');
    const raiseBtn = document.getElementById('raise-btn');
    
    foldBtn.style.display = 'none';
    checkBtn.style.display = 'none';
    callBtn.style.display = 'none';
    allInBtn.style.display = 'none';
    betInput.style.display = 'none';
    betSlider.style.display = 'none';
    betBtn.style.display = 'none';
    raiseBtn.style.display = 'none';
    
    // Check if it's the current player's turn
    const isYourTurn = gameState.players && 
                      gameState.currentTurn !== undefined && 
                      gameState.players[gameState.currentTurn] && 
                      gameState.players[gameState.currentTurn].id === playerID;
    
    if (!isYourTurn || gameState.state === 'waiting' || gameState.state === 'showdown') {
        return;
    }
    
    const currentPlayer = gameState.players ? gameState.players.find(p => p.id === playerID) : null;
    if (!currentPlayer) return;
    
    let highestBet = 0;
    if (gameState.players) {
        for (const player of gameState.players) {
            if (player.bet > highestBet) {
                highestBet = player.bet;
            }
        }
    }
    
    foldBtn.style.display = 'block';
    
    if (highestBet === 0 || currentPlayer.bet === highestBet) {
        checkBtn.style.display = 'block';
    }
    
    if (highestBet > currentPlayer.bet) {
        callBtn.style.display = 'block';
        callBtn.textContent = `Call $${highestBet - currentPlayer.bet}`;
    }
    
    // Always show All In button if player has chips
    if (currentPlayer.chips > 0) {
        allInBtn.style.display = 'block';
        allInBtn.textContent = `All In $${currentPlayer.chips}`;
        
        betInput.style.display = 'block';
        betSlider.style.display = 'block';
        
        const minBet = gameState.bigBlind || 10;
        const maxBet = currentPlayer.chips;
        
        betInput.min = minBet;
        betInput.max = maxBet;
        betInput.value = Math.min(minBet, maxBet);
        
        betSlider.min = minBet;
        betSlider.max = maxBet;
        betSlider.value = Math.min(minBet, maxBet);
        
        if (highestBet === 0) {
            betBtn.style.display = 'block';
        } else {
            raiseBtn.style.display = 'block';
        }
    }
}

// Show winner message
function showWinner(winner) {
    const winnerMessage = document.getElementById('winner-message');
    const winnerName = document.getElementById('winner-name');
    const winnerAmount = document.getElementById('winner-amount');
    const winnerHand = document.getElementById('winner-hand');
    
    winnerName.textContent = winner.playerName || 'Unknown';
    winnerAmount.textContent = `Won $${winner.amount || 0}`;
    
    if (winner.handRank) {
        winnerHand.textContent = `Hand: ${winner.handRank}`;
        winnerHand.style.display = 'block';
    } else {
        winnerHand.style.display = 'none';
    }
    
    winnerMessage.classList.remove('hidden');
    
    setTimeout(() => {
        winnerMessage.classList.add('hidden');
    }, 5000);
}

// Add chat message
function addChatMessage(chatData) {
    if (!chatData.playerName || !chatData.message) return;
    
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    const escapedMessage = escapeHTML(chatData.message);
    
    messageElement.innerHTML = `<strong>${escapeHTML(chatData.playerName)}:</strong> ${escapedMessage}`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Add system message to chat
function addSystemMessage(message) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    
    messageElement.innerHTML = `<em class="system-message">${escapeHTML(message)}</em>`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Basic HTML escape function to prevent XSS
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Initialize modal functionality
function initializeModal() {
    const rulesBtn = document.getElementById('rules-btn');
    const rulesModal = document.getElementById('rules-modal');
    const closeModal = document.querySelector('.close-modal');
    
    rulesBtn.addEventListener('click', () => {
        rulesModal.classList.remove('hidden');
    });
    
    closeModal.addEventListener('click', () => {
        rulesModal.classList.add('hidden');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === rulesModal) {
            rulesModal.classList.add('hidden');
        }
    });
}