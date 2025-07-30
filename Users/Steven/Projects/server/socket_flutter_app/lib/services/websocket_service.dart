import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService extends ChangeNotifier {
  WebSocketChannel? _channel;
  bool _isConnected = false;
  String _connectionStatus = 'Disconnected';
  int _reconnectAttempts = 0;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;

  static const String _wsUrl = 'ws://localhost:3000/ws';
  static const int _maxReconnectAttempts = 5;
  static const Duration _reconnectDelay = Duration(seconds: 3);
  static const Duration _heartbeatInterval = Duration(seconds: 30);

  bool get isConnected => _isConnected;
  String get connectionStatus => _connectionStatus;

  WebSocketService() {
    connect();
  }

  void connect() {
    _updateConnectionStatus('Connecting');
    
    try {
      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));
      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onClose,
      );
      
      _isConnected = true;
      _reconnectAttempts = 0;
      _updateConnectionStatus('Connected');
      _startHeartbeat();
    } catch (e) {
      _onError(e);
    }
  }

  void _onMessage(dynamic message) {
    try {
      final decodedMessage = json.decode(message);
      if (kDebugMode) {
        print('Received: $decodedMessage');
      }
      
      if (decodedMessage['type'] == 'heartbeat_ack') {
        return;
      }
      
      notifyListeners();
    } catch (e) {
      if (kDebugMode) {
        print('Error parsing message: $e');
      }
    }
  }

  void _onError(dynamic error) {
    if (kDebugMode) {
      print('WebSocket error: $error');
    }
    _isConnected = false;
    _updateConnectionStatus('Error');
  }

  void _onClose() {
    if (kDebugMode) {
      print('WebSocket closed');
    }
    _isConnected = false;
    _updateConnectionStatus('Disconnected');
    _stopHeartbeat();
    _attemptReconnect();
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      if (_isConnected) {
        sendMessage({'type': 'heartbeat'});
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _attemptReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      _updateConnectionStatus('Max reconnect attempts reached');
      return;
    }

    _reconnectAttempts++;
    _updateConnectionStatus('Reconnecting ($_reconnectAttempts/$_maxReconnectAttempts)');
    
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_reconnectDelay, () {
      connect();
    });
  }

  void sendMessage(Map<String, dynamic> message) {
    if (_isConnected && _channel != null) {
      final jsonMessage = json.encode(message);
      _channel!.sink.add(jsonMessage);
      
      if (kDebugMode) {
        print('Sent: $jsonMessage');
      }
    }
  }

  void sendAction(String actionType, {int amount = 0}) {
    sendMessage({
      'type': 'action',
      'payload': {
        'type': actionType,
        'amount': amount,
      },
    });
  }

  void sendChatMessage(String text) {
    sendMessage({
      'type': 'chat',
      'payload': text.trim(),
    });
  }

  void _updateConnectionStatus(String status) {
    _connectionStatus = status;
    notifyListeners();
  }

  @override
  void dispose() {
    _channel?.sink.close();
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    super.dispose();
  }
}