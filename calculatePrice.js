/*jslint node: true */
'use strict';
const request = require('request');
const notifications = require('./notifications');
const db = require('byteballcore/db');
const moment = require('moment');
const conf = require('byteballcore/conf');
const { checkCriticalWeather } = require('./weather');

function getCountDelayedFlights(objRatings, delay) {
	let delayedFlights = 0;

	if (delay < 15)
		delayedFlights += objRatings.ontime;

	if (delay < 30)
		delayedFlights += objRatings.late15;

	if (delay < 45)
		delayedFlights += objRatings.late30;

	if (delay <= 45)
		delayedFlights += objRatings.late45;

	delayedFlights += objRatings.cancelled;
	delayedFlights += objRatings.diverted;
	return delayedFlights;
}

function getRatings(flight, cb) {
	let arrFlightMatches = flight.match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);
	db.query("SELECT * FROM flightstats_ratings WHERE flight=? AND departure_airport IS NOT NULL AND date > " + db.addTime('-30 days'), [flight], (rows) => {
		if (rows.length !== 0) {
			cb(null, rows[0]);
		} else {
			request('https://api.flightstats.com/flex/ratings/rest/v1/json/flight/' + arrFlightMatches[1] + '/' + arrFlightMatches[2] +
				'?appId=' + conf.flightstats.appId + '&appKey=' + conf.flightstats.appKey, (error, response, body) => {
				if (error || response.statusCode !== 200) {
					notifications.notifyAdmin("getting flightstats data for failed: " + error + ", status=" + (response ? response.statusCode : 'none'));
					return cb("Failed to fetch flightstats data.");
				}
				console.log(flight+' ratings response: '+body);
				let jsonResult = JSON.parse(body);
				if (jsonResult.error && jsonResult.error.errorMessage) {
					notifications.notifyAdmin("error from flightstats: " + body);
					return cb("Error from flightstats: " + jsonResult.error.errorMessage);
				}

				if (!Array.isArray(jsonResult.ratings)) return cb("No information about this flight.");

				let objRatings = chooseBestRating(jsonResult.ratings);
				objRatings.departure_airport = objRatings.departureAirportFsCode;
				objRatings.arrival_airport = objRatings.arrivalAirportFsCode;

				if (objRatings.observations >= conf.minObservations)
					db.query("INSERT OR REPLACE INTO flightstats_ratings (flight, date, observations, ontime, late15, late30, late45, cancelled, diverted, delayMax, departure_airport, arrival_airport) VALUES(?, " + db.getNow() + ", ?, ?,?,?,?, ?,?, ?, ?,?)",
						[flight, objRatings.observations, objRatings.ontime, objRatings.late15, objRatings.late30, objRatings.late45, objRatings.cancelled, objRatings.diverted, objRatings.delayMax, objRatings.departure_airport, objRatings.arrival_airport]);
				else
					console.log('only '+objRatings.observations+' observations');

				cb(null, objRatings);
			});
		}
	});
}

function chooseBestRating(arrRatings){
	if (arrRatings.length === 1)
		return arrRatings[0];
	if (arrRatings.length === 0)
		throw Error('no ratings');
	var r;
	var maxObservations = 0;
	arrRatings.forEach(objRatings => {
		if (objRatings.observations > maxObservations){
			maxObservations = objRatings.observations;
			r = objRatings;
		}
	});
	if (!r)
		throw Error('no best rating');
	return r;
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

	state.departure_airport = null;
	state.arrival_airport = null;
	
	if (conf.analysisOfRealTimeDelays) {
		getRatings(flight, (err, objRatings) => {
			if (err) return cb(err);

			let flight = state.flight.match(/\b[A-Z0-9]{2}\s*\d{1,4}([A-Z]?)\s\d{1,2}\.\d{1,2}\.\d{4}\b/)[0];
			flight = flight.replace(flight.match(/\b[A-Z0-9]{2}(\s*)\d{1,4}([A-Z]?)\s\d{1,2}\.\d{1,2}\.\d{4}\b/)[1], '');
			let flight_date = flight.split(' ')[1];
			
			checkCriticalWeather(flight_date, [objRatings.departure_airport, objRatings.arrival_airport], (is_critical) => {
				if (is_critical) {
					state.flight = null;
					state.delay = null;
					state.compensation = null;
					state.price = null;
					state.save();

					return cb('The insurance is refused due to critical weather.')
				}

				
			});

			state.departure_airport = objRatings.departure_airport;
			state.arrival_airport = objRatings.arrival_airport;

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
			if (objRatings.observations < conf.minObservations)
				offlineCalculate(state, function(err, offline_price){
					if (err)
						return cb(err);
					cb(null, Math.max(price, offline_price));
				});
			else
				cb(null, price);
		});
	} else {
		offlineCalculate(state, cb);
	}
};