/*jslint node: true */
'use strict';
const request = require('request');
const notifications = require('./notifications');
const db = require('byteballcore/db');
const moment = require('moment');
const conf = require('byteballcore/conf');

function getCountDelayedFlights(objRatings, delay) {
	let delayedFlights = 0;

	if (delay < 15)
		delayedFlights += objRatings.ontime;

	if (delay < 30)
		delayedFlights += objRatings.late15;

	if (delay < 45)
		delayedFlights += objRatings.late30;

	if (delay === 45)
		delayedFlights += objRatings.late45;

	delayedFlights += objRatings.cancelled;
	delayedFlights += objRatings.diverted;
	return delayedFlights;
}

function getRatings(flight, cb) {
	let arrFlightMatches = flight.match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);
	db.query("SELECT * FROM flightstats_ratings WHERE flight = ? AND date > " + db.addTime('-30 days'), [flight], (rows) => {
		if (rows.length !== 0) {
			cb(null, rows[0]);
		} else {
			request('https://api.flightstats.com/flex/ratings/rest/v1/json/flight/' + arrFlightMatches[1] + '/' + arrFlightMatches[2] +
				'?appId=' + conf.flightstats.appId + '&appKey=' + conf.flightstats.appKey, (error, response, body) => {
				if (error || response.statusCode !== 200) {
					notifications.notifyAdmin("getting flightstats data for failed: " + error + ", status=" + response.statusCode);
					return cb("Failed to fetch flightstats data.");
				}
				let jsonResult = JSON.parse(body);
				if (jsonResult.error && jsonResult.error.errorMessage) {
					notifications.notifyAdmin("error from flightstats: " + body);
					return cb("Error from flightstats: " + jsonResult.error.errorMessage);
				}

				if (!Array.isArray(jsonResult.ratings)) return cb("No information about this flight.");

				let objRatings = jsonResult.ratings[0];

				if (objRatings.observations >= conf.minObservations)
					db.query("INSERT OR REPLACE INTO flightstats_ratings (date, observations, ontime, late15, late30, late45, cancelled, diverted, delayMax, flight) VALUES(" + db.getNow() + ",?,?,?,?,?,?,?,?,?)",
						[objRatings.observations, objRatings.ontime, objRatings.late15, objRatings.late30, objRatings.late45, objRatings.cancelled, objRatings.diverted, objRatings.delayMax, flight], () => {});

				cb(null, objRatings);
			});
		}
	});
}

function offlineCalculate(state, cb) {
	let flight = state.flight.split(' ')[0];
	let arrFlightMatches = flight.match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);

	let percent = 0;
	if (state.delay >= 45) percent = conf.defaultPriceInPercent.gt45;
	else if (state.delay >= 30) percent = conf.defaultPriceInPercent.gt30;
	else if (state.delay >= 15) percent = conf.defaultPriceInPercent.gt15;
	else percent = conf.defaultPriceInPercent.gt0;

	if (conf.coefficientsForFlight && conf.coefficientsForFlight[flight]) {
		percent *= conf.coefficientsForFlight[flight];
	} else if (conf.coefficientForAirline && conf.coefficientForAirline[arrFlightMatches[1]]) {
		percent *= conf.coefficientForAirline[arrFlightMatches[1]];
	}
	if (percent > conf.maxPriceInPercent) {
		return cb("The probability of this delay is too high, please increase the delay time.");
	}

	let price = state.compensation * percent / 100;
	if (price.toString().match(/\./)) {
		if (price.toString().split('.')[1].length > 9) price = price.toFixed(9);
	}
	return cb(null, price);
}

module.exports = (state, cb) => {
	let flight = state.flight.split(' ')[0];

	if (conf.analysisOfRealTimeDelays) {
		getRatings(flight, (err, objRatings) => {
			if (err) return cb(err);

			if (objRatings.observations < conf.minObservations) return offlineCalculate(state, cb);

			let minDelay = 0;
			let maxDelay = 0;

			if (state.delay <= 15 || objRatings.delayMax <= 15) {
				minDelay = 0;
				maxDelay = 15;
			} else if (state.delay <= 30 || objRatings.delayMax <= 30) {
				minDelay = 15;
				maxDelay = 30;
			} else if (state.delay <= 45 || objRatings.delayMax <= 45) {
				minDelay = 30;
				maxDelay = 45;
			} else {
				minDelay = 45;
				maxDelay = objRatings.delayMax;
			}

			let percentageDelays = 100 * getCountDelayedFlights(objRatings, maxDelay) / objRatings.observations;
			let percentageDelays2 = 100 * getCountDelayedFlights(objRatings, minDelay) / objRatings.observations;

			let percent;

			percent = (percentageDelays2 + (percentageDelays - percentageDelays2) * (Math.min(state.delay, maxDelay) - minDelay) / (maxDelay - minDelay)) + conf.profitMargin;

			if (percent > conf.maxPriceInPercent) {
				return cb("The probability of this delay is too high, please increase the delay time.");
			}
			let price = state.compensation * percent / 100;
			if (price.toString().match(/\./)) {
				if (price.toString().split('.')[1].length > 9) price = price.toFixed(9);
			}
			return cb(null, price);
		});
	} else {
		offlineCalculate(state, cb);
	}
};