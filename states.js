/*jslint node: true */
'use strict';
const db = require('ocore/db');

exports.get = (device_address, cb) => {
	db.query("SELECT * FROM states WHERE device_address = ? LIMIT 0,1", [device_address], (rows) => {
		let state = rows.length ? rows[0] : {step: 1};
		state.device_address = device_address;

		state.save = () => {
			db.query("INSERT OR REPLACE INTO states (device_address, flight, delay, compensation, price, `date`, departure_airport, arrival_airport) VALUES(?,?,?,?,?," + db.getNow() + ", ?,?)",
				[device_address, state.flight || null, state.delay || null, state.compensation || null, state.price || null, state.departure_airport, state.arrival_airport]);
		};

		return cb(state);
	});
};