# Texas Hold'em Poker Flutter App

A Flutter implementation of the Texas Hold'em Poker game, converted from the original JavaScript/HTML implementation located at `/Users/Steven/Projects/server/socket/static/`.

## Features

- **Real-time WebSocket Communication**: Connects to the poker server for live gameplay
- **Interactive Poker Table**: Visual representation of the game state
- **Player Management**: Display of player positions, cards, and chip counts
- **Betting Actions**: Fold, Check, Call, Bet, Raise, and All-in actions
- **Live Chat**: In-game chat system for player communication
- **Responsive Design**: Adapts to different screen sizes

## Architecture

The app uses the following structure:

- **Services**: WebSocket service for communication, Game service for state management
- **Screens**: Main game screen with poker table layout
- **Widgets**: Reusable components for cards, players, actions, and chat

## Getting Started

### Prerequisites

- Flutter SDK (3.5.3 or later)
- Dart SDK
- The poker server running on `localhost:3000`

### Installation

1. Navigate to the project directory:
   ```bash
   cd socket_flutter_app
   ```

2. Install dependencies:
   ```bash
   flutter pub get
   ```

3. Run the app:
   ```bash
   flutter run
   ```

### Dependencies

- `provider`: ^6.1.2 - State management
- `web_socket_channel`: ^2.4.4 - WebSocket communication

## WebSocket Integration

The app connects to a WebSocket server at `ws://localhost:3000/ws` to:
- Receive game state updates
- Send player actions (fold, check, call, bet, raise, all-in)
- Handle chat messages
- Maintain connection with heartbeat and reconnection logic

## File Structure

```
lib/
├── main.dart                 # App entry point
├── services/
│   ├── websocket_service.dart # WebSocket communication
│   └── game_service.dart      # Game state management
├── screens/
│   └── game_screen.dart       # Main game interface
└── widgets/
    ├── card_widget.dart       # Playing card display
    ├── player_widget.dart     # Player information display
    ├── action_buttons.dart    # Betting action controls
    └── chat_widget.dart       # Chat interface
```
