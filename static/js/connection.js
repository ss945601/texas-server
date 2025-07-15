// WebSocket connection handling

let socket = null;
let heartbeatInterval = null;
let reconnectAttempts = 0;

// Connect to WebSocket server
function connectWebSocket() {
    console.log('🔌 Attempting WebSocket connection...');
    updateConnectionStatus('connecting');
    resetGameUI();
    
    console.log('🌐 WebSocket URL:', WS_URL);
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('🛑 Closing existing WebSocket connection');
        socket.close();
    }
    
    socket = new WebSocket(WS_URL);
    
    socket.onopen = function() {
        console.log('✅ WebSocket connection established');
        reconnectAttempts = 0;
        startHeartbeat();
        updateConnectionStatus('connected');
        addSystemMessage('Connected to server');
    };
    
    socket.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('📨 Received:', message);
            handleMessage(message);
        } catch (err) {
            console.error('❗ Error parsing message:', err, 'Raw data:', event.data);
            addSystemMessage('Error receiving server message');
        }
    };
    
    socket.onclose = function(event) {
        console.log('❌ WebSocket closed:', event);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        updateConnectionStatus('disconnected');
        addSystemMessage(`Disconnected from server (code: ${event.code}, reason: ${event.reason || 'unknown'})`);
        attemptReconnect();
    };
    
    socket.onerror = function(error) {
        console.error('❗ WebSocket error:', error);
        updateConnectionStatus('disconnected');
        addSystemMessage('Connection error: ' + (error.message || 'Unknown error'));
    };
}

// Start sending heartbeats
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log('💓 Sending heartbeat');
            socket.send(JSON.stringify({ type: 'heartbeat' }));
        } else {
            console.log('⚠️ Cannot send heartbeat: Socket not open');
        }
    }, HEARTBEAT_INTERVAL);
}

// Reconnect logic
function attemptReconnect() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        updateConnectionStatus('connecting');
        addSystemMessage(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(connectWebSocket, RECONNECT_DELAY);
    } else {
        console.error('❌ Maximum reconnection attempts reached. Please refresh the page.');
        updateConnectionStatus('disconnected');
        addSystemMessage('Maximum reconnection attempts reached. Please refresh the page.');
        document.getElementById('game-state').textContent = 'Connection lost. Please refresh the page.';
        document.getElementById('game-state').style.color = 'red';
    }
}

// Send player action
function sendAction(actionType, amount = 0) {
    if (actionType === 'bet' || actionType === 'raise') {
        amount = parseInt(amount, 10);
        if (isNaN(amount) || amount <= 0) {
            addSystemMessage('Invalid bet/raise amount');
            return;
        }
        
        const currentPlayer = gameState.players ? gameState.players.find(p => p.id === playerID) : null;
        if (currentPlayer && amount > currentPlayer.chips) {
            addSystemMessage(`Cannot ${actionType} more than your chips (${currentPlayer.chips})`);
            return;
        }
        
        if (gameState.bigBlind && amount < gameState.bigBlind && gameState.state === 'preflop') {
            addSystemMessage(`Bet/raise must be at least the big blind (${gameState.bigBlind})`);
            return;
        }
    }
    
    const action = { type: actionType, amount };
    const message = { type: 'action', payload: action };
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('⬆️ Sending action:', action);
        socket.send(JSON.stringify(message));
    } else {
        addSystemMessage('Cannot send action: Not connected to server');
    }
}

// Send chat message
function sendChatMessage(text) {
    text = text.trim();
    if (!text) return;
    
    if (text.length > 200) {
        addSystemMessage('Chat message too long (max 200 characters)');
        return;
    }
    
    const message = { type: 'chat', payload: text };
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('💬 Sending chat:', text);
        socket.send(JSON.stringify(message));
        document.getElementById('chat-input').value = '';
    } else {
        addSystemMessage('Cannot send message: Not connected to server');
    }
}