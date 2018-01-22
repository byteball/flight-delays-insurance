const request = require('request');
const moment = require('moment');
const conf = require('byteballcore/conf');
const notifications = require('./notifications');
const Cache = require('./cache'),
	cache = new Cache('weather', 'airport', 'weather');

exports.checkCriticalWeather = (flight_date, airports, callback) => {
	const [day, month, year] = flight_date.split('.')

	if (day > 31 || month > 12)
		return callback(texts.invalidDate());

	const key = [day, month, year].join('_')

	const getWeather = (airports) => {
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
						if (object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == checkedDates[0] ||
							object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == checkedDates[1] ||
							object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == checkedDates[2]) {
							if (conf.critical.indexOf(object.tags[0].value) != -1) {
								resolve(false);
							}
						}

						resolve(true);
					}
				};

				cache.get(`${airport}_${key}`)
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
									cache.set(`${airport}_${key}`, 'none');

									return callback();
								}

								weather = body.zoneForecast.dayForecasts;

								cache.set(`${airport}_${key}`, weather);
								check(weather);
							});
						} else if (weather == 'none')
							return callback();

						check(weather);
					})
					.catch(err => {
						notifications.notifyAdmin('refund checkCriticalWeather failed', err);
						callback('Internal error');
					});
			});
		};

		callback();

		checkWeatherAtAirport(airports[0])
			.then(status => {
				if (!status) {
					return callback(texts.criticalWeather());
				}

				return checkWeatherAtAirport(airports[1]);
			})
			.then(check.then(status => {
				if (!status) {
					return callback(texts.criticalWeather());
				}

				callback();
			}).catch(error => {
				throw error;
			})).catch(error => {
				throw error;
			});
	}

	getWeather(airports);
}