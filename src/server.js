const express = require('express');
const path = require('path');
const http = require('http'); // Import http for WebSocket server
const WebSocket = require('ws'); // Import WebSocket

const app = express();
const PORT = process.env.PORT || 3000;

// Define the path to your Flutter web build directory
// path.resolve() is used here to ensure the path is absolute,
// which is generally safer for serving static files.
// It will resolve from the current working directory of the server.js file.
const flutterBuildPath = path.resolve(__dirname, '../../socket_flutter_app/build/web');

// Serve static files from the Flutter build directory
app.use(express.static(flutterBuildPath));

// For any other route, serve the index.html from the Flutter build directory.
// This is crucial for single-page applications (SPAs) like Flutter web,
// so that deep links work when the user directly accesses a route that
// is handled by the Flutter app's client-side routing.
app.get('*', (req, res) => {
  res.sendFile(path.join(flutterBuildPath, 'index.html'));
});

// Create an HTTP server
const server = http.createServer(app);

// Create a WebSocket server instance
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', ws => {
  console.log('Client connected');

  ws.on('message', message => {
    console.log(`Received message: ${message}`);
    // Echo the message back to the client, or process it as needed for your game
    ws.send(`Server received: ${message}`);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', error => {
    console.error('WebSocket error:', error);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Serving Flutter app from: ${flutterBuildPath}`);
});
