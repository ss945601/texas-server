// Player represents a poker player
class Player {
    constructor(id, name, conn) {
        this.id = id;
        this.name = name;
        this.conn = conn;
        this.holeCards = [];
        this.chips = 1000;
        this.bet = 0;
        this.folded = false;
        this.active = true;
        this.stop = false;
    }
}

module.exports = Player;