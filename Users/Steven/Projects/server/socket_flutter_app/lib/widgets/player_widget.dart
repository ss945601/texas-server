import 'package:flutter/material.dart';
import 'card_widget.dart';

class PlayerWidget extends StatelessWidget {
  final Map<String, dynamic> player;
  final bool isCurrentPlayer;
  final bool isCurrentTurn;

  const PlayerWidget({
    super.key,
    required this.player,
    required this.isCurrentPlayer,
    required this.isCurrentTurn,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.9),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isCurrentTurn
              ? Colors.yellow
              : isCurrentPlayer
                  ? Colors.amber
                  : Colors.grey,
          width: isCurrentTurn ? 3 : (isCurrentPlayer ? 2 : 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(2, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${player['name'] ?? 'Unknown'}${player['folded'] ? ' (Folded)' : ''}',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: player['folded'] ? Colors.grey : Colors.black,
            ),
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            '\$${player['chips'] ?? 0}',
            style: const TextStyle(fontSize: 12),
          ),
          Text(
            'Bet: \$${player['bet'] ?? 0}',
            style: const TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (player['holeCards'] != null && player['holeCards'].length >= 2)
                ...[
                  if (isCurrentPlayer || _shouldShowCards())
                    CardWidget(card: player['holeCards'][0])
                  else
                    const CardBackWidget(),
                  const SizedBox(width: 2),
                  if (isCurrentPlayer || _shouldShowCards())
                    CardWidget(card: player['holeCards'][1])
                  else
                    const CardBackWidget(),
                ]
              else
                ...[
                  const CardBackWidget(),
                  const SizedBox(width: 2),
                  const CardBackWidget(),
                ],
            ],
          ),
          if (isCurrentTurn)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.yellow,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'Turn',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  bool _shouldShowCards() {
    // Show cards during showdown
    return false; // This will be implemented based on game state
  }
}