import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/websocket_service.dart';
import '../services/game_service.dart';
import '../widgets/card_widget.dart';
import '../widgets/player_widget.dart';
import '../widgets/action_buttons.dart';
import '../widgets/chat_widget.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final webSocketService = Provider.of<WebSocketService>(context, listen: false);
      final gameService = Provider.of<GameService>(context, listen: false);
      
      // Set up message handling by overriding the WebSocket service's message handler
      // In a real app, you'd use a proper state management solution
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Texas Hold\'em Poker'),
        actions: [
          Consumer<WebSocketService>(
            builder: (context, webSocketService, child) {
              return Row(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: webSocketService.isConnected ? Colors.green : Colors.red,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(webSocketService.connectionStatus),
                ],
              );
            },
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: Row(
        children: [
          // Left sidebar with game info and chat
          SizedBox(
            width: 300,
            child: Column(
              children: [
                _buildGameInfoPanel(),
                const Expanded(child: ChatWidget()),
              ],
            ),
          ),
          // Main game area
          Expanded(
            child: Column(
              children: [
                // Game table
                Expanded(
                  child: _buildGameTable(),
                ),
                // Action buttons
                _buildActionPanel(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGameInfoPanel() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        final currentPlayer = gameService.getCurrentPlayer();
        
        return Card(
          margin: const EdgeInsets.all(8),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Game Info',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text('State: ${gameService.getGameStateText()}'),
                Text('Pot: \$${gameService.getPotAmount()}'),
                Text(gameService.getBlindsInfo()),
                const SizedBox(height: 8),
                if (currentPlayer != null)
                  Text(
                    'You: ${gameService.playerName} - \$${currentPlayer['chips']}',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildGameTable() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        return Container(
          margin: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.green[800],
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.brown, width: 8),
          ),
          child: Stack(
            children: [
              // Community cards
              Positioned(
                top: 20,
                left: 0,
                right: 0,
                child: Center(
                  child: _buildCommunityCards(gameService.getCommunityCards()),
                ),
              ),
              // Pot display
              Positioned(
                top: 80,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'Pot: \$${gameService.getPotAmount()}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
              // Players
              ..._buildPlayerPositions(gameService.getPlayers()),
              // Winner message
              if (gameService.winner != null)
                Positioned(
                  top: 120,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: _buildWinnerMessage(gameService.winner!),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCommunityCards(List<dynamic> cards) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 5; i++)
          if (i < cards.length)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: CardWidget(card: cards[i]),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Container(
                width: 60,
                height: 84,
                decoration: BoxDecoration(
                  color: Colors.green[900],
                  border: Border.all(color: Colors.white24),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
      ],
    );
  }

  List<Widget> _buildPlayerPositions(List<dynamic> players) {
    final positions = [
      const Offset(0.5, 0.85), // Bottom center
      const Offset(0.15, 0.7),  // Bottom left
      const Offset(0.15, 0.3),  // Top left
      const Offset(0.5, 0.15),  // Top center
      const Offset(0.85, 0.3),  // Top right
      const Offset(0.85, 0.7),  // Bottom right
    ];

    return players.asMap().entries.map((entry) {
      final index = entry.key;
      final player = entry.value;
      final position = positions[index % positions.length];

      return Positioned(
        left: position.dx * MediaQuery.of(context).size.width * 0.7,
        top: position.dy * MediaQuery.of(context).size.height * 0.6,
        child: PlayerWidget(
          player: player,
          isCurrentPlayer: player['id'] == Provider.of<GameService>(context, listen: false).playerId,
          isCurrentTurn: index == Provider.of<GameService>(context, listen: false).getCurrentTurn(),
        ),
      );
    }).toList();
  }

  Widget _buildWinnerMessage(Map<String, dynamic> winner) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.amber.withOpacity(0.9),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Winner!',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.black,
            ),
          ),
          Text(
            winner['name'] ?? 'Unknown',
            style: const TextStyle(fontSize: 18, color: Colors.black),
          ),
          Text(
            'Won \$${winner['amount'] ?? 0}',
            style: const TextStyle(fontSize: 16, color: Colors.black),
          ),
          if (winner['hand'] != null)
            Text(
              'Hand: ${winner['hand']}',
              style: const TextStyle(fontSize: 14, color: Colors.black54),
            ),
        ],
      ),
    );
  }

  Widget _buildActionPanel() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        return Container(
          padding: const EdgeInsets.all(16),
          child: ActionButtons(
            onAction: (action, amount) {
              Provider.of<WebSocketService>(context, listen: false)
                  .sendAction(action, amount: amount);
            },
            isCurrentTurn: gameService.isCurrentPlayerTurn(),
            currentPlayer: gameService.getCurrentPlayer(),
            gameState: gameService.gameState,
          ),
        );
      },
    );
  }
}