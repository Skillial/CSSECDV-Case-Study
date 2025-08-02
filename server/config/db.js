const Database = require('better-sqlite3');
const OccasioDB = new Database('./db/Occasio.db');

module.exports = { OccasioDB };