import 'package:flutter/material.dart';

class CardWidget extends StatelessWidget {
  final Map<String, dynamic> card;

  const CardWidget({super.key, required this.card});

  String get suit => card['suit'] ?? '';
  String get rank => card['rank'] ?? '';

  Color get cardColor {
    return (suit == 'hearts' || suit == 'diamonds') ? Colors.red : Colors.black;
  }

  String get suitSymbol {
    const symbols = {
      'hearts': '♥',
      'diamonds': '♦',
      'clubs': '♣',
      'spades': '♠',
    };
    return symbols[suit] ?? '';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 60,
      height: 84,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(2, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Padding(
            padding: const EdgeInsets.all(2),
            child: Text(
              rank,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: cardColor,
              ),
            ),
          ),
          Text(
            suitSymbol,
            style: TextStyle(
              fontSize: 20,
              color: cardColor,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(2),
            child: Text(
              rank,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: cardColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CardBackWidget extends StatelessWidget {
  const CardBackWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 60,
      height: 84,
      decoration: BoxDecoration(
        color: Colors.blue[800],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(2, 2),
          ),
        ],
      ),
      child: const Center(
        child: Icon(
          Icons.casino,
          color: Colors.white,
          size: 30,
        ),
      ),
    );
  }
}