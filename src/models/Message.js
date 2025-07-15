// Message represents a message sent between client and server
class Message {
    constructor(type, payload) {
        this.type = type;
        this.payload = payload;
    }
}

module.exports = Message;