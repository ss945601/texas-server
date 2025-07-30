// Card suit symbols
const SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
};

// Card rank display
const RANK_DISPLAY = {
    'A': 'A',
    'K': 'K',
    'Q': 'Q',
    'J': 'J',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
};

// Game state text
const STATE_TEXT = {
    'waiting': 'Waiting for players',
    'preflop': 'Pre-flop',
    'flop': 'Flop',
    'turn': 'Turn',
    'river': 'River',
    'showdown': 'Showdown'
};

// WebSocket configuration
const WS_URL = window.location.protocol === 'https:' 
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.host}/ws`;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds