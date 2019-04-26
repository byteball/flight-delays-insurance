const conf = require('ocore/conf');
const db = require('ocore/db');

const seconds = 60 * 60

module.exports = class {
	constructor(name, key, value) {
		this.name = name
		this.key = key
		this.value = value

		setInterval(() => this.clear(), 1000*60, 1000, this);
	}

	clear(self) {
		const ts = new Date

		ts.setHours(ts.getHours()-conf.cacheHours)

		db.query(`DELETE FROM ${this.name}_cache WHERE ts<=?`, [Math.floor(ts.getTime()/1000)]);
	}

	set(key, data) {
		db.query(`INSERT OR REPLACE INTO ${this.name}_cache (${this.key}, ${this.value}, ts) VALUES(?, ?, ?)`, 
		[key, JSON.stringify(data), Math.floor((new Date).getTime()/1000)]);
	}

	get(key) {
		return new Promise((resolve, reject) => {
			db.query(`SELECT ${this.value} FROM ${this.name}_cache WHERE ${this.key}=?`, [key], (rows) => {
				let data = null

				try {
					data = JSON.parse(rows[0].value)
				} catch (err) {}

				resolve(rows.length ? data : null)
			});
		});
	}
}