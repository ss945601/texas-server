// Main initialization and event listeners

// Initialize the game
document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI components
    initializeModal();
    
    // Set up bet slider and input synchronization
    const betSlider = document.getElementById('bet-slider');
    const betInput = document.getElementById('bet-amount');
    
    betSlider.addEventListener('input', function() {
        betInput.value = this.value;
    });
    
    betInput.addEventListener('input', function() {
        betSlider.value = this.value;
    });
    
    // Set up action button event listeners
    document.getElementById('fold-btn').addEventListener('click', () => sendAction('fold'));
    document.getElementById('check-btn').addEventListener('click', () => sendAction('check'));
    document.getElementById('call-btn').addEventListener('click', () => sendAction('call'));
    
    document.getElementById('all-in-btn').addEventListener('click', () => {
        const currentPlayer = gameState.players ? gameState.players.find(p => p.id === playerID) : null;
        if (currentPlayer) {
            const allInAmount = currentPlayer.chips;
            let highestBet = 0;
            if (gameState.players) {
                for (const player of gameState.players) {
                    if (player.bet > highestBet) {
                        highestBet = player.bet;
                    }
                }
            }
            
            // Determine if this is a call, bet, or raise based on the current game state
            if (highestBet > currentPlayer.bet) {
                sendAction('call', allInAmount);
            } else if (highestBet === 0) {
                sendAction('bet', allInAmount);
            } else {
                sendAction('raise', allInAmount);
            }
        }
    });
    
    document.getElementById('bet-btn').addEventListener('click', () => {
        const amount = document.getElementById('bet-amount').value;
        sendAction('bet', amount);
    });
    
    document.getElementById('raise-btn').addEventListener('click', () => {
        const amount = document.getElementById('bet-amount').value;
        sendAction('raise', amount);
    });
    
    // Set up chat event listeners
    document.getElementById('chat-send').addEventListener('click', () => {
        const chatInput = document.getElementById('chat-input');
        sendChatMessage(chatInput.value);
    });
    
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage(e.target.value);
        }
    });
    
    // Connect to WebSocket server
    connectWebSocket();
});