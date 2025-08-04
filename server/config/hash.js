const bcrypt = require('bcrypt');
async function hashString(string) {
    const salt = await bcrypt.genSalt(10);

    string = await bcrypt.hash(string, salt);
    return string;
}

module.exports = { hashString };