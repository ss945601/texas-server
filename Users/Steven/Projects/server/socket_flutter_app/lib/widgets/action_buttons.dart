import 'package:flutter/material.dart';

class ActionButtons extends StatefulWidget {
  final Function(String action, int amount) onAction;
  final bool isCurrentTurn;
  final Map<String, dynamic>? currentPlayer;
  final Map<String, dynamic> gameState;

  const ActionButtons({
    super.key,
    required this.onAction,
    required this.isCurrentTurn,
    required this.currentPlayer,
    required this.gameState,
  });

  @override
  State<ActionButtons> createState() => _ActionButtonsState();
}

class _ActionButtonsState extends State<ActionButtons> {
  double _betAmount = 10;
  late double _minBet;
  late double _maxBet;

  @override
  void initState() {
    super.initState();
    _updateBetRange();
  }

  @override
  void didUpdateWidget(ActionButtons oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.gameState != oldWidget.gameState) {
      _updateBetRange();
    }
  }

  void _updateBetRange() {
    final bigBlind = widget.gameState['bigBlind'] ?? 10;
    final currentPlayer = widget.currentPlayer;
    
    _minBet = bigBlind.toDouble();
    _maxBet = (currentPlayer?['chips'] ?? 1000).toDouble();
    
    if (_betAmount < _minBet) _betAmount = _minBet;
    if (_betAmount > _maxBet) _betAmount = _maxBet;
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isCurrentTurn || widget.currentPlayer == null) {
      return const SizedBox.shrink();
    }

    final currentPlayer = widget.currentPlayer!;
    final chips = currentPlayer['chips'] ?? 0;
    final currentBet = currentPlayer['bet'] ?? 0;
    
    // Calculate highest bet among all players
    double highestBet = 0;
    final players = widget.gameState['players'] ?? [];
    for (final player in players) {
      if (player['bet'] > highestBet) {
        highestBet = player['bet'].toDouble();
      }
    }
    
    final amountToCall = (highestBet - currentBet).toInt();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildActionButton(
                  'Fold',
                  Colors.red,
                  () => widget.onAction('fold', 0),
                ),
                if (amountToCall == 0)
                  _buildActionButton(
                    'Check',
                    Colors.blue,
                    () => widget.onAction('check', 0),
                  )
                else
                  _buildActionButton(
                    'Call \$$amountToCall',
                    Colors.green,
                    () => widget.onAction('call', amountToCall),
                  ),
                _buildActionButton(
                  'All In',
                  Colors.orange,
                  () {
                    final allInAmount = chips;
                    if (amountToCall > 0 && allInAmount <= amountToCall) {
                      widget.onAction('call', allInAmount);
                    } else if (highestBet == 0) {
                      widget.onAction('bet', allInAmount);
                    } else {
                      widget.onAction('raise', allInAmount);
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (highestBet == 0 || chips > amountToCall)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Slider(
                    value: _betAmount,
                    min: _minBet,
                    max: _maxBet,
                    divisions: ((_maxBet - _minBet) / 10).round(),
                    label: '\$${_betAmount.round()}',
                    onChanged: (value) {
                      setState(() {
                        _betAmount = value;
                      });
                    },
                  ),
                  const SizedBox(width: 16),
                  SizedBox(
                    width: 80,
                    child: TextField(
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      controller: TextEditingController(
                        text: _betAmount.round().toString(),
                      ),
                      onChanged: (value) {
                        final newAmount = double.tryParse(value) ?? _minBet;
                        if (newAmount >= _minBet && newAmount <= _maxBet) {
                          setState(() {
                            _betAmount = newAmount;
                          });
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  if (highestBet == 0)
                    _buildActionButton(
                      'Bet',
                      Colors.amber,
                      () => widget.onAction('bet', _betAmount.round()),
                    )
                  else
                    _buildActionButton(
                      'Raise',
                      Colors.amber,
                      () => widget.onAction('raise', _betAmount.round()),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton(String text, Color color, VoidCallback onPressed) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      ),
      child: Text(text),
    );
  }
}