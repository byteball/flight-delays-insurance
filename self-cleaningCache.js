const conf = require('byteballcore/conf');
const db = require('byteballcore/db');

const seconds = 60 * 60

module.exports = class {
    constructor() {
        setInterval(this.clear, conf.cacheHours, 1000, this);
    }

    clear(self) {
        db.query('DELETE FROM weather_cache');
    }

    set(key, data) {
        db.query('INSERT OR REPLACE INTO weather_cache (key, value) VALUES(?, ?)', [key, JSON.stringify(data)]);
    }

    get(key) {
        return new Promise((resolve, reject) => {
            db.query('SELECT `value` FROM weather_cache WHERE key=?', [key], (rows) => {
                resolve(rows.length ? JSON.parse(rows) : null)
            });
        });
    }
}