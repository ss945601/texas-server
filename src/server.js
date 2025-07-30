const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { handleConnection } = require('./services/connectionManager');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '../web')));

// Handle WebSocket connections
wss.on('connection', handleConnection);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server starting on port ${PORT}`);
});