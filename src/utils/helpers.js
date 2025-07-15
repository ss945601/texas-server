const { v4: uuidv4 } = require('uuid');

// Generates a random alphanumeric ID
function generateID() {
    return uuidv4().slice(0, 8);
}

module.exports = {
    generateID
};