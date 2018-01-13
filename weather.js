const request = require('request');
const md5 = require('md5');
const moment = require('moment');
const conf = require('byteballcore/conf');
const scCache = require('./self-cleaningCache'),
    cache = new scCache;

exports.checkCriticalWeather = (flightText, callback) => {
    if (!flightText)
        return callback();

    const [carrier, flight, day, month, year] = flightText.match(/([a-z]+)(\d+)\s*(\d+).(\d+).(\d+)/i).splice(1, 5);

    if (day > 31 || month > 12)
        return callback(texts.invalidDate());

    const key = md5([carrier, flight, day, month, year].join('_'))

    const weather = (airports) => {
        const
            currentDay = moment(`${+year}-${+month}-${+day}`),
            lastDay = new Date(currentDay),
            preDay = new Date(currentDay);

        lastDay.setHours(lastDay.getHours() - 24);
        preDay.setHours(preDay.getHours() + 24);

        const flightDates = [
            moment(lastDay).format('YYYY-MM-DD'),
            currentDay.format('YYYY-MM-DD'),
            moment(preDay).format('YYYY-MM-DD')
        ];

        const checkWeatherAtCurrentAirport = (airport) => {
            return new Promise((resolve, reject) => {
                const check = dayForecasts => {
                    for (const object of dayForecasts) {
                        if (object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == flightDate[0] ||
                            object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == flightDate[1] ||
                            object.start.replace(/(\d+)-(\d+)-(\d+).*/, '$1-$2-$3') == flightDate[2]) {
                            if (conf.critical.indexOf(object.tags[0].value) != -1) {
                                resolve(false);
                            }
                        }

                        resolve(true);
                    }
                };

                let weather = cache.get(`weather_${airport}_${key}`);

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
                            cache.set(`weather_${airport}_${key}`, 'none');

                            return callback();
                        }

                        weather = body.zoneForecast.dayForecasts;

                        cache.set(`weather_${airport}_${key}`, weather);
                        check(weather);
                    });
                } else if (weather == 'none')
                    return callback();

                check(weather);
            });
        };

        callback();

        checkWeatherAtCurrentAirport(airports[0])
            .then(status => {
                if (!status) {
                    return callback(texts.criticalWeather());
                }

                return checkWeatherAtCurrentAirport(airports[1]);
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

    let airports = cache.get(`airport_${key}`);

    if (!airports) {
        return request({
            url: 'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/' + carrier +
                '/' + flight + '/arr/' + year + '/' + month + '/' + day,
            qs: {
                appId: conf.flightstats.appId,
                appKey: conf.flightstats.appKey,
                utc: false
            },
            json: true
        }, (error, response, body) => {
            if (error)
                throw error;

            if (!body.appendix.airports) {
                cache.set(`airport_${key}`, 'none')

                return callback();
            }

            airports = [body.appendix.airports[0].fs, body.appendix.airports[1].fs];
            cache.set(`airport_${key}`, airports)

            weather(airports);
        });
    } else if (airports == 'none')
        return callback();

    weather(airports);
}