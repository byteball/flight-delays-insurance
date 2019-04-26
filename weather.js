const request = require('request');
const moment = require('moment');
const conf = require('ocore/conf');
const notifications = require('./notifications');
const texts = require('./texts');
const Cache = require('./cache'),
	cache = new Cache('weather', 'airport', 'weather');

exports.checkCriticalWeather = (flight_date, airports, callback) => {
	const [day, month, year] = flight_date.split('.')

	if (day > 31 || month > 12)
		return callback(texts.invalidDate());

	const
		flightDate = moment(`${+year}-${+month}-${+day}`),
		previousDay = new Date(flightDate),
		nextDay = new Date(flightDate);

	previousDay.setHours(previousDay.getHours() - 24);
	nextDay.setHours(nextDay.getHours() + 24);

	const checkedDates = [
		moment(previousDay).format('YYYY-MM-DD'),
		flightDate.format('YYYY-MM-DD'),
		moment(nextDay).format('YYYY-MM-DD')
	];

	const checkWeatherAtAirport = (airport) => {
		return new Promise((resolve, reject) => {
			const check = dayForecasts => {
				for (const object of dayForecasts) {
					let date = object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3');
					if (date == checkedDates[0] ||
						date == checkedDates[1] ||
						date == checkedDates[2]) {
						if (conf.criticalConditions.indexOf(object.tags[0].value) != -1) {
							return resolve(false);
						}
					}
				}
				resolve(true);
			};

			cache.get(airport)
				.then(weather => {
					if (!weather) {
						request({
							url: 'https://api.flightstats.com/flex/weather/rest/v1/json/zf/' + airport,
							qs: {
								appId: conf.flightstats.appId,
								appKey: conf.flightstats.appKey,
								codeType: 'fs'
							},
							json: true
						}, (error, response, body) => {
							if (error)
								throw error;

							if (!body.zoneForecast) {
								cache.set(airport, 'none');

								return resolve(true);
							}

							weather = body.zoneForecast.dayForecasts;

							cache.set(airport, weather);
							check(weather);
						});
						return;
					}
					else if (weather == 'none')
						return resolve(true);

					check(weather);
				})
				.catch(err => {
					notifications.notifyAdmin('checkCriticalWeather failed', err);
					resolve(true);
				});
		});
	};

	checkWeatherAtAirport(airports[0])
		.then(status => {
			console.error(airports[0]+' status '+status);
			if (!status) {
				return callback(texts.criticalWeather());
			}

			return checkWeatherAtAirport(airports[1]);
		})
		.then(status => {
			console.error(airports[1]+' status '+status);
			if (status === undefined) // exited before
				return;
			if (!status) {
				return callback(texts.criticalWeather());
			}

			callback();
		});
}