import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'websocket_service.dart';

class GameService extends ChangeNotifier {
  String _playerId = '';
  String _playerName = '';
  Map<String, dynamic> _gameState = {};
  List<Map<String, dynamic>> _chatMessages = [];
  Map<String, dynamic>? _winner;

  String get playerId => _playerId;
  String get playerName => _playerName;
  Map<String, dynamic> get gameState => _gameState;
  List<Map<String, dynamic>> get chatMessages => _chatMessages;
  Map<String, dynamic>? get winner => _winner;

  GameService() {
    _setupWebSocketListeners();
  }

  void _setupWebSocketListeners() {
    // This will be set up when the service is provided
  }

  void setWebSocketService(WebSocketService webSocketService) {
    // This method is for integration - actual message handling will be done through direct calls
  }

  void handleWebSocketMessage(Map<String, dynamic> message) {
    if (kDebugMode) {
      print('Processing message: $message');
    }

    switch (message['type']) {
      case 'welcome':
        _playerId = message['payload']['playerID'] ?? '';
        _playerName = message['payload']['playerName'] ?? 'Unknown';
        _addChatMessage({
          'type': 'system',
          'message': 'Joined game as $_playerName',
          'timestamp': DateTime.now().toIso8601String(),
        });
        break;

      case 'gameState':
        _gameState = message['payload'] ?? {};
        _winner = null; // Clear winner when new game state arrives
        break;

      case 'winner':
        _winner = message['payload'] ?? {};
        break;

      case 'chat':
        _addChatMessage({
          'type': 'player',
          'message': message['payload'],
          'timestamp': DateTime.now().toIso8601String(),
        });
        break;

      case 'error':
        _addChatMessage({
          'type': 'error',
          'message': 'Server error: ${message['payload']['message']}',
          'timestamp': DateTime.now().toIso8601String(),
        });
        break;
    }

    notifyListeners();
  }

  void _addChatMessage(Map<String, dynamic> message) {
    _chatMessages.add(message);
    if (_chatMessages.length > 100) {
      _chatMessages.removeAt(0);
    }
  }

  void sendAction(String actionType, {int amount = 0}) {
    // This will be handled by WebSocketService
  }

  void sendChatMessage(String text) {
    // This will be handled by WebSocketService
  }

  String getGameStateText() {
    final state = _gameState['state'] ?? 'waiting';
    const stateText = {
      'waiting': 'Waiting for players',
      'preflop': 'Pre-flop',
      'flop': 'Flop',
      'turn': 'Turn',
      'river': 'River',
      'showdown': 'Showdown',
    };
    return stateText[state] ?? state;
  }

  int getPotAmount() {
    return _gameState['pot'] ?? 0;
  }

  String getBlindsInfo() {
    final smallBlind = _gameState['smallBlind'] ?? 5;
    final bigBlind = _gameState['bigBlind'] ?? 10;
    return 'Blinds: \$$smallBlind/\$$bigBlind';
  }

  List<dynamic> getPlayers() {
    return _gameState['players'] ?? [];
  }

  List<dynamic> getCommunityCards() {
    return _gameState['communityCards'] ?? [];
  }

  int getCurrentTurn() {
    return _gameState['currentTurn'] ?? 0;
  }

  Map<String, dynamic>? getCurrentPlayer() {
    final players = getPlayers();
    return players.firstWhere(
      (player) => player['id'] == _playerId,
      orElse: () => null,
    );
  }

  bool isCurrentPlayerTurn() {
    final players = getPlayers();
    final currentTurn = getCurrentTurn();
    return players.isNotEmpty && 
           currentTurn < players.length && 
           players[currentTurn]['id'] == _playerId;
  }

  void clearWinner() {
    _winner = null;
    notifyListeners();
  }

  @override
  void dispose() {
    super.dispose();
  }
}