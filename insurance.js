/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf');
const db = require('byteballcore/db');
const eventBus = require('byteballcore/event_bus');
const headlessWallet = require('headless-byteball');
const texts = require('./texts');
const states = require('./states');
const moment = require('moment');
const calculatePrice = require('./calculatePrice');
const offerFlightDelaysContract = require('./offerFlightDelaysContract');
const validationUtils = require('byteballcore/validation_utils');
const notifications = require('./notifications');
const correspondents = require('./correspondents');
const contract = require('./contract');
const wallet = require('byteballcore/wallet');
const async = require('async');

let oracle_device_address;

let assocWaitingStableFeednamesByUnits = {};

headlessWallet.setupChatEventHandlers();

function sendRequestsToOracle(rows) {
	let device = require('byteballcore/device');
	if (!rows.length) return;

	rows.forEach((row) => {
		let name = row.feed_name.split('-')[0] + ' ' + moment(row.date).format("DD.MM.YYYY");
		device.sendMessageToDevice(oracle_device_address, 'text', name);
	});
	setTimeout(checkStatusOfContracts, 1000 * 60, rows);
}

function refund(contractRow) {
	contract.getMyAddressFromContract(contractRow.shared_address, (myAddress) => {
		if(contractRow.asset){
			headlessWallet.sendAssetFromAddress(contractRow.asset, contractRow.amount, contractRow.shared_address, myAddress, null, (err, unit) => {
				if (err) return notifications.notifyAdmin('refund sendAssetFromAddress '+contractRow.shared_address+' failed', err);
				contract.setUnlockedContract(contractRow.shared_address, unit);
			});
		}else {
			headlessWallet.sendAllBytesFromAddress(contractRow.shared_address, myAddress, null, (err, unit) => {
				if (err) return notifications.notifyAdmin('refund sendAllBytesFromAddress '+contractRow.shared_address+' failed', err);
				contract.setUnlockedContract(contractRow.shared_address, unit);
			});
		}
	});
}

function payToPeer(contractRow) {
	let device = require('byteballcore/device');
	if (contractRow.asset) {
		headlessWallet.sendAssetFromAddress(contractRow.asset, contractRow.amount, contractRow.shared_address, contractRow.peer_address, contractRow.peer_device_address, (err, unit) => {
			if (err) return notifications.notifyAdmin('payToPeer sendAssetFromAddress failed', err);
			contract.setUnlockedContract(contractRow.shared_address, unit);
			device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.weSentPayment());
		});
	} else {
		device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.pleaseUnlock());
		contract.setUnlockedContract(contractRow.shared_address, null);
	}
}

function checkStatusOfContracts(rows) {
	let device = require('byteballcore/device');
	let arrFeedNames = rows.map(row => row.feed_name);
	let assocContractsByFeedName = {};
	rows.forEach((row) => {
		if (!assocContractsByFeedName[row.feed_name]) assocContractsByFeedName[row.feed_name] = [];
		assocContractsByFeedName[row.feed_name].push(row);
	});
	db.query("SELECT data_feeds.feed_name, data_feeds.int_value, units.unit, units.is_stable\n\
	FROM data_feeds JOIN unit_authors USING(unit) JOIN units USING(unit)\n\
	WHERE data_feeds.feed_name IN(?)\n\
	AND unit_authors.address = ?", [arrFeedNames, conf.oracle_address], (rows2) => {
		rows2.forEach((row) => {
			if (assocContractsByFeedName[row.feed_name]) {
				assocContractsByFeedName[row.feed_name].forEach((contractRow) => {
					if (row.int_value > contractRow.delay) {
						if (row.is_stable) {
							payToPeer(contractRow);
						} else {
							assocWaitingStableFeednamesByUnits[row.unit] = row.feed_name;
						}
						contract.setWinner(contractRow.feed_name, 'peer');
					} else {
						device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.arrivedOnTime());
						if (row.is_stable) {
							refund(contractRow);
						} else {
							assocWaitingStableFeednamesByUnits[row.unit] = row.feed_name;
						}
						contract.setWinner(contractRow.feed_name, 'me');
					}
				});
			}
		});
	});
}

eventBus.on('mci_became_stable', (mci) => {
	let arrWaitingStableUnits = Object.keys(assocWaitingStableFeednamesByUnits);
	if (arrWaitingStableUnits.length === 0)
		return;
	db.query("SELECT unit FROM units WHERE main_chain_index = ? AND unit IN(?)", [mci, arrWaitingStableUnits], (rows) => {
		rows.forEach((row) => {
			contract.getContractsByFeedName(assocWaitingStableFeednamesByUnits[row.unit], (rowsContracts) => {
				rowsContracts.forEach((contractRow) => {
					if (contractRow.winner) {
						if (contractRow.winner === 'me') {
							refund(contractRow);
						} else if (contractRow.winner === 'peer') {
							payToPeer(contractRow);
						}
					}
				});
				delete assocWaitingStableFeednamesByUnits[row.unit];
			});
		});
	});
});


eventBus.on('new_my_transactions', (arrUnits) => {
	let device = require('byteballcore/device.js');
	db.query(
		"SELECT outputs.amount, peer_amount, outputs.asset AS received_asset, contracts.asset AS expected_asset, peer_device_address \n\
		FROM outputs JOIN contracts ON address=shared_address \n\
		WHERE unit IN(?) AND NOT EXISTS (SELECT 1 FROM unit_authors CROSS JOIN my_addresses USING(address) WHERE unit_authors.unit=outputs.unit)", 
		[arrUnits], 
		function(rows){
			rows.forEach(row => {
				if (row.received_asset !== row.expected_asset)
					return device.sendMessageToDevice(row.peer_device_address, 'text', "Received payment in wrong asset");
				if (row.amount !== row.peer_amount)
					return device.sendMessageToDevice(row.peer_device_address, 'text', "Received wrong amount: expected "+row.peer_amount+", received "+row.amount);
				device.sendMessageToDevice(row.peer_device_address, 'text', "Received your payment.  Your insurance contract is now fully paid, we'll check the status of your flight and let you know.");
			});
		}
	);
});


eventBus.on('paired', (from_address) => {
	let device = require('byteballcore/device.js');
	device.sendMessageToDevice(from_address, 'text', texts.flight());
});

function getHelpText(command) {
	switch (command) {
		case 'FLIGHT':
			return texts.flight();
			break;
		case 'DELAY':
			return texts.delay();
			break;
		case 'COMPENSATION':
			return texts.compensation();
			break;
	}

	return false;
}

eventBus.on('text', (from_address, text) => {
	if (from_address === oracle_device_address) return;

	states.get(from_address, (state) => {
		let device = require('byteballcore/device.js');
		let ucText = text.toUpperCase().trim().replace(/\s+/, ' ');

		if (getHelpText(ucText)) return device.sendMessageToDevice(from_address, 'text', getHelpText(ucText));

		if (moment(state.date).add(3, 'days') < moment()) {
			state.flight = null;
			state.delay = null;
			state.compensation = null;
		}
		
		function createContract(){
			// calc the price again
			calculatePrice(state, (err, price) => {
				if (err) return device.sendMessageToDevice(from_address, 'text', err);
				state.price = price;
				state.save();
				headlessWallet.issueOrSelectNextMainAddress((myAddress) => {
					offerFlightDelaysContract(myAddress, moment(state.flight.split(' ')[1], "DD.MM.YYYY"), {
						peerAddress: ucText,
						peerDeviceAddress: from_address,
						peerAmount: state.price,
						myAmount: state.compensation - state.price,
						asset: 'base',
						flight: state.flight,
						departure_airport: state.departure_airport,
						arrival_airport: state.arrival_airport,
						relation: '>',
						feedValue: state.delay,
						expiry: conf.contractExpiry, //days
						timeout: conf.contractTimeout //hours
					}, function (err, paymentRequestText) {
						if (err) {
							notifications.notifyAdmin('offerContract error', JSON.stringify(err));
							return device.sendMessageToDevice(from_address, 'text', texts.errorOfferContract());
						}
						state.flight = null;
						state.delay = null;
						state.compensation = null;
						state.price = null;
						state.save();
						return device.sendMessageToDevice(from_address, 'text', 'This is your contract, please check and pay within 15 minutes: '+paymentRequestText);
					});
				});
			});
		}

		if (validationUtils.isValidAddress(ucText) && state.price && state.compensation && state.flight && state.delay) {
			let minDay = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
			if (moment(state.flight.split(' ')[1], "DD.MM.YYYY").valueOf() >= minDay) {
				if (moment(state.flight.split(' ')[1], "DD.MM.YYYY").valueOf() <= moment().add(conf.maxMonthsBeforeFlight, 'month').valueOf()) {
					let arrSplitFlight = state.flight.split(' ');
					let flight_number = arrSplitFlight[0];
					let flight_date = arrSplitFlight[1];
					let m = moment(flight_date, 'DD.MM.YYYY');
					let feed_name = flight_number + '-' + m.format('YYYY-MM-DD');
					db.query("SELECT SUM(amount) AS total_amount FROM contracts WHERE feed_name=?", [feed_name], rows => {
						if (rows[0].total_amount + state.compensation*1e9 >= conf.maxExposureToFlight*1e9)
							return device.sendMessageToDevice(from_address, 'text', "Can't sell any more insurance for this flight and date.");
						let airline = flight_number.substr(0, 2);
						db.query(
							"SELECT SUM(amount) AS total_amount FROM contracts WHERE feed_name LIKE ? AND date>"+db.getNow()+" AND refunded=0", 
							[airline+'%'], 
							rows => {
								if (rows[0].total_amount + state.compensation*1e9 >= conf.maxExposureToAirline*1e9)
									return device.sendMessageToDevice(from_address, 'text', "Can't sell any more insurance for this airline, try again in a few days.");
								if (!state.departure_airport || !state.arrival_airport)
									return createContract();
								db.query(
									"SELECT SUM(amount) AS total_amount FROM contracts \n\
									WHERE (departure_airport IN(?,?) || arrival_airport IN(?,?)) AND date>"+db.getNow()+" AND refunded=0", 
									[state.departure_airport, state.arrival_airport, state.departure_airport, state.arrival_airport], 
									rows => {
										if (rows[0].total_amount + state.compensation*1e9 >= conf.maxExposureToAirport*1e9)
											return device.sendMessageToDevice(from_address, 'text', "Can't sell any more insurance for flights between these airports, try again in a few days.");
										createContract();
									}
								);
							}
						);
					});
					return;
				} else {
					state.flight = null;
					state.save();
					return device.sendMessageToDevice(from_address, 'text', texts.errorMaxMonthsBeforeFlight(conf.maxMonthsBeforeFlight));
				}
			} else {
				state.flight = null;
				state.save();
				return device.sendMessageToDevice(from_address, 'text', texts.errorMinDaysBeforeFlight(conf.minDaysBeforeFlight));
			}
		}

		if (/\b[A-Z0-9]{2}\s*\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/.test(ucText)) {
			let flight = ucText.match(/\b[A-Z0-9]{2}\s*\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/)[0];
			ucText = ucText.replace(flight, '').trim();
			flight = flight.replace(flight.match(/\b[A-Z0-9]{2}(\s*)\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/)[1], ''); // remove space between airline and number?
			let flight_number = flight.split(' ')[0];
			let flight_date = flight.split(' ')[1];
			let arrFlightMatches = flight_number.match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);

			if (flight && moment(flight_date, "DD.MM.YYYY").isValid()) {
				let minDay = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
				if (moment(flight_date, "DD.MM.YYYY").valueOf() >= minDay) {
					if (moment(flight_date, "DD.MM.YYYY").valueOf() <= moment().add(conf.maxMonthsBeforeFlight, 'month').valueOf()) {
						if (conf.nonInsurableAirlines.indexOf(arrFlightMatches[1]) === -1 && conf.nonInsurableFlights.indexOf(flight_number === -1) {
							state.flight = flight;
							state.price = null;
						} else {
							return device.sendMessageToDevice(from_address, 'text', texts.errorNonInsurable());
						}
					} else {
						return device.sendMessageToDevice(from_address, 'text', texts.errorMaxMonthsBeforeFlight(conf.maxMonthsBeforeFlight));
					}
				} else {
					return device.sendMessageToDevice(from_address, 'text', texts.errorMinDaysBeforeFlight(conf.minDaysBeforeFlight));
				}
			} else {
				return device.sendMessageToDevice(from_address, 'text', texts.errorValidDate());
			}
		}

		if (/[0-9]+\s(MINUTES|MINUTE|HOURS|HOUR)/.test(ucText)) {
			let arrTime = ucText.match(/[0-9]+\s(MINUTES|MINUTE|HOURS|HOUR)/)[0].split(' ');
			ucText = ucText.replace(ucText.match(/[0-9]+\s(MINUTES|MINUTE|HOURS|HOUR)/)[0], '').trim();

			let minutes;
			if (arrTime[1] === 'MINUTES' || arrTime[1] === 'MINUTE') {
				minutes = parseInt(arrTime[0]);
			} else {
				minutes = parseInt(arrTime[0]) * 60;
			}

			state.delay = minutes;
			state.price = null;
		}

		if (/\b\d+,\d+\b/.test(ucText)) ucText = ucText.replace(',', '.');
		if (/[\d.]+\b/.test(ucText)) {
			let compensation = parseFloat(ucText.match(/[\d.]+\b/)[0]);
			ucText = ucText.replace(ucText.match(/[\d.]+\b/)[0], '').trim();
			if (compensation > conf.maxCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMaxCompensation());
			} else if (compensation < conf.minCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMinCompensation());
			}
			state.compensation = compensation;
			state.price = null;
		}

		state.save();

		if (!state.flight) return device.sendMessageToDevice(from_address, 'text', texts.flight());
		if (!state.delay) return device.sendMessageToDevice(from_address, 'text', texts.delay());
		if (!state.compensation) return device.sendMessageToDevice(from_address, 'text', texts.compensation());

		if (/BUY$/.test(ucText)) {
			return device.sendMessageToDevice(from_address, 'text', texts.insertMyAddress());
		} else if (ucText === 'EDIT') {
			return device.sendMessageToDevice(from_address, 'text', texts.edit());
		}

		calculatePrice(state, (err, price) => {
			if (err) return device.sendMessageToDevice(from_address, 'text', err);
			state.price = price;
			state.save();
			return device.sendMessageToDevice(from_address, 'text', texts.total(state.flight, state.delay, state.compensation, price));
		});
	});
});


function getListContractsAndSendRequest() {
	contract.getListOfContactsForVerification((rows) => {
		sendRequestsToOracle(rows);
	});
}

function checkAndRetryUnlockContracts() {
	contract.getContractsToRetryUnlock((rows) => {
		rows.forEach((contractRow) => {
			if (contractRow.winner) {
				if (contractRow.winner === 'me') {
					refund(contractRow);
				} else if (contractRow.winner === 'peer') {
					payToPeer(contractRow);
				}
			}
		});
	});
}

eventBus.on('headless_wallet_ready', () => {
	var error = '';
	let arrTableNames = ['flightstats_ratings', 'states', 'contracts'];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?)", [arrTableNames], (rows) => {
		if (rows.length !== arrTableNames.length) error += texts.errorInitSql();

		if (conf.useSmtp && (!conf.smtpUser || !conf.smtpPassword || !conf.smtpHost)) error += texts.errorSmtp();

		if (!conf.admin_email || !conf.from_email) error += texts.errorEmail();

		if (conf.analysisOfRealTimeDelays && (!conf.flightstats.appId || !conf.flightstats.appKey || !conf.profitMargin)) error += texts.errorFlightstats();

		if (error)
			throw new Error(error);

		setInterval(contract.checkAndRefundContractsTimeout, 3600 * 1000);
		contract.checkAndRefundContractsTimeout();

		correspondents.findCorrespondentByPairingCode(conf.oracle_pairing_code, (correspondent) => {
			if (!correspondent) {
				correspondents.addCorrespondent(conf.oracle_pairing_code, 'flight oracle', (err, device_address) => {
					if (err)
						throw new Error(err);
					oracle_device_address = device_address;
					getListContractsAndSendRequest();
				});
			} else {
				oracle_device_address = correspondent.device_address;
				getListContractsAndSendRequest();
			}
		});

		setInterval(getListContractsAndSendRequest, 6 * 3600 * 1000);

		checkAndRetryUnlockContracts();
		setInterval(checkAndRetryUnlockContracts, 6 * 3600 * 1000);
	});
});
