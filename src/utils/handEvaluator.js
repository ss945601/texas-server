// Evaluates a poker hand and returns its rank and key cards
function evaluateHand(cards) {
    const rankValues = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };

    // Group cards by rank and suit
    const rankCounts = {};
    const suitCounts = {};
    cards.forEach(card => {
        rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    });

    const ranks = Object.keys(rankCounts).sort((a, b) => rankValues[b] - rankValues[a]);
    const isFlush = Object.values(suitCounts).some(count => count >= 5);
    const rankValuesSorted = cards.map(card => rankValues[card.rank]).sort((a, b) => b - a);

    // Check for straight
    let straightHigh = 0;
    const values = [...new Set(cards.map(card => rankValues[card.rank]))].sort((a, b) => b - a);
    if (values.includes(14)) values.push(1); // Ace-low straight
    for (let i = 0; i <= values.length - 5; i++) {
        if (values[i] - values[i + 4] === 4) {
            straightHigh = values[i];
            break;
        }
    }

    // Check hand types in order of strength
    if (isFlush && straightHigh && straightHigh === 14) {
        return { rank: 9, value: straightHigh, kickers: [] }; // Royal Flush
    }
    if (isFlush && straightHigh) {
        return { rank: 8, value: straightHigh, kickers: [] }; // Straight Flush
    }
    if (Object.values(rankCounts).includes(4)) {
        const quadRank = ranks.find(r => rankCounts[r] === 4);
        const kicker = ranks.filter(r => r !== quadRank)[0];
        return { rank: 7, value: rankValues[quadRank], kickers: [rankValues[kicker]] }; // Four of a Kind
    }
    if (Object.values(rankCounts).includes(3) && Object.values(rankCounts).includes(2)) {
        const tripsRank = ranks.find(r => rankCounts[r] === 3);
        const pairRank = ranks.find(r => rankCounts[r] === 2);
        return { rank: 6, value: rankValues[tripsRank], kickers: [rankValues[pairRank]] }; // Full House
    }
    if (isFlush) {
        const flushCards = cards.filter(card => suitCounts[card.suit] >= 5)
            .map(card => rankValues[card.rank])
            .sort((a, b) => b - a)
            .slice(0, 5);
        return { rank: 5, value: flushCards[0], kickers: flushCards.slice(1) }; // Flush
    }
    if (straightHigh) {
        return { rank: 4, value: straightHigh, kickers: [] }; // Straight
    }
    if (Object.values(rankCounts).includes(3)) {
        const tripsRank = ranks.find(r => rankCounts[r] === 3);
        const kickers = ranks.filter(r => rankCounts[r] < 3).slice(0, 2).map(r => rankValues[r]);
        return { rank: 3, value: rankValues[tripsRank], kickers }; // Three of a Kind
    }
    if (Object.values(rankCounts).filter(count => count === 2).length >= 2) {
        const pairs = ranks.filter(r => rankCounts[r] === 2).slice(0, 2);
        const kicker = ranks.filter(r => rankCounts[r] === 1)[0];
        return { rank: 2, value: rankValues[pairs[0]], kickers: [rankValues[pairs[1]], rankValues[kicker]] }; // Two Pair
    }
    if (Object.values(rankCounts).includes(2)) {
        const pairRank = ranks.find(r => rankCounts[r] === 2);
        const kickers = ranks.filter(r => rankCounts[r] === 1).slice(0, 3).map(r => rankValues[r]);
        return { rank: 1, value: rankValues[pairRank], kickers }; // One Pair
    }
    return { rank: 0, value: rankValuesSorted[0], kickers: rankValuesSorted.slice(1, 5) }; // High Card
}

// Compares two poker hands
function compareHands(hand1, hand2) {
    if (hand1.rank !== hand2.rank) return hand1.rank - hand2.rank;
    if (hand1.value !== hand2.value) return hand1.value - hand2.value;
    for (let i = 0; i < Math.min(hand1.kickers.length, hand2.kickers.length); i++) {
        if (hand1.kickers[i] !== hand2.kickers[i]) return hand1.kickers[i] - hand2.kickers[i];
    }
    return 0;
}

// Generates all possible 5-card combinations
function getCombinations(cards, k) {
    const result = [];
    function combine(current, start, k) {
        if (current.length === k) {
            result.push([...current]);
            return;
        }
        for (let i = start; i < cards.length; i++) {
            current.push(cards[i]);
            combine(current, i + 1, k);
            current.pop();
        }
    }
    combine([], 0, k);
    return result;
}

// Helper function to get hand rank name
function getHandRankName(rank) {
    const rankNames = [
        'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
        'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
    ];
    return rankNames[rank] || 'Unknown';
}

module.exports = {
    evaluateHand,
    compareHands,
    getCombinations,
    getHandRankName
};