const WebSocket = require('ws');

// Create a variable for the WebSocket connection that can be reassigned
let ws = new WebSocket('ws://localhost:8080/ws');

// Reconnect logic
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

function attemptReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    setTimeout(() => {
      // Close the old connection if it's still open
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }

      // Create a new connection
      ws = new WebSocket('ws://localhost:8080/ws');

      // Set up all event handlers for the new connection
      setupWebSocketHandlers(ws);

    }, RECONNECT_DELAY);
  } else {
    console.error('❌ Maximum reconnection attempts reached. Please restart the client.');
  }
}

// Function to set up all WebSocket event handlers
function setupWebSocketHandlers(socket) {
  socket.on('open', function open() {
    console.log('✅ Connected to server');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection

    // Send a test action after a short delay
    setTimeout(() => {
      console.log('⬆️ Sending test action: CHECK');
      socket.send(JSON.stringify({
        type: 'action',
        payload: {
          type: 'check',
          amount: 0
        }
      }));
    }, 2000);
  });

  socket.on('message', function message(data) {
    try {
      const parsedMessage = JSON.parse(data.toString());

      // Handle different message types from the server
      switch (parsedMessage.type) {
        case 'welcome':
          console.log('👋 Received welcome message:', parsedMessage.payload);
          break;
        case 'gameState':
          console.log('🎮 Received game state update:', parsedMessage.payload);
          // You would typically update your UI based on this game state
          if (parsedMessage.payload.yourTurn) {
            console.log('✨ It\'s your turn!');
            // Here you might enable action buttons for the player
          }
          break;
        case 'winner':
          console.log('🏆 Winner declared:', parsedMessage.payload);
          break;
        case 'error':
          console.error('🚫 Received error from server:', parsedMessage.payload.message);
          break;
        case 'chat':
          console.log(`💬 Chat from ${parsedMessage.payload.sender}: ${parsedMessage.payload.message}`);
          break;
        default:
          console.log('📨 Received unknown message type:', parsedMessage.type, 'Payload:', parsedMessage.payload);
      }
    } catch (e) {
      console.error('❗ Error parsing message:', e, 'Raw data:', data.toString());
    }
  });

  socket.on('close', function close() {
    console.log('❌ Disconnected from server');
    attemptReconnect(); // Attempt to reconnect
  });

  socket.on('error', function error(err) {
    console.error('❗ WebSocket Error:', err.message);
    // The 'close' event will usually follow an 'error' event, triggering reconnect
  });

  // Handle ping from server (automatic pong response by ws library)
  socket.on('ping', function(data) {
    console.log('💓 Received ping from server (data:', data.toString(), ')');
  });

  // Handle pong from server (acknowledgment of client's ping, though we removed client pings)
  socket.on('pong', function() {
    console.log('💓 Received pong from server');
  });
}

// Set up handlers for the initial WebSocket connection
setupWebSocketHandlers(ws);

// Example of sending a chat message (you can trigger this from your client's input)
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('⬆️ Sending test chat message');
    ws.send(JSON.stringify({
      type: 'chat',
      payload: 'Hello from the client!'
    }));
  }
}, 5000); // Send a chat message after 5 seconds
