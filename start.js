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

let my_address;
let oracle_device_address;

let arrWaitingStableUnits = [];

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
	getMyAddressFromContract(contractRow.shared_address, (myAddress) => {
		if(contractRow.asset){
			headlessWallet.sendAssetFromSharedAddress(contractRow.asset, contractRow.amount, null, contractRow.shared_address, myAddress, null, (err) => {
				if (err) return console.error(new Error(err));
				contract.setUnlockedContract(contractRow.shared_address);
			});
		}else {
			headlessWallet.sendAllBytesFromSharedAddress(contractRow.shared_address, myAddress, null, (err) => {
				if (err) return console.error(new Error(err));
				contract.setUnlockedContract(contractRow.shared_address);
			});
		}
	});
}

function payToPeer(contractRow) {
	let device = require('byteballcore/device');
	if (contractRow.asset) {
		headlessWallet.sendAssetFromSharedAddress(contractRow.asset, contractRow.amount, null, contractRow.shared_address, contractRow.peer_address, contractRow.peer_device_address, (err) => {
			if (err) return console.error(new Error(err));
			contract.setUnlockedContract(contractRow.shared_address);
			device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.weSentPayment());
		});
	} else {
		device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.contractStable());
		contract.setUnlockedContract(contractRow.shared_address);
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
	FROM data_feeds, unit_authors JOIN units USING(unit)\n\
	WHERE data_feeds.feed_name IN(?)\n\
	AND unit_authors.unit = data_feeds.unit\n\
	AND unit_authors.address = ?", [arrFeedNames, conf.oracle_address], (rows2) => {
		rows2.forEach((row) => {
			if (assocContractsByFeedName[row.feed_name]) {
				assocContractsByFeedName[row.feed_name].forEach((contractRow) => {
					if (row.int_value > contractRow.delay) {
						if (row.is_stable) {
							payToPeer(contractRow);
						} else {
							if (arrWaitingStableUnits.indexOf(row.unit) === -1) arrWaitingStableUnits.push(row.unit);
						}
						contract.setWinner(contractRow.feed_name, 'peer');
					} else {
						device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.arriveOnTime());
						if (row.is_stable) {
							refund(contractRow);
						} else {
							if (arrWaitingStableUnits.indexOf(row.unit) === -1) arrWaitingStableUnits.push(row.unit);
						}
						contract.setWinner(contractRow.feed_name, 'me');
					}
				});
			}
		});
	});
}

eventBus.on('mci_became_stable', (mci) => {
	let device = require('byteballcore/device');
	db.query("SELECT unit FROM units WHERE main_chain_index = ?", [mci], (rows) => {
		rows.forEach((row) => {
			if (arrWaitingStableUnits[row.unit]) {
				contract.getContractsByFeedName(arrWaitingStableUnits[row.unit], (rowsContracts) => {
					rowsContracts.forEach((contractRow) => {
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
		});
	});
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

		if (validationUtils.isValidAddress(ucText) && state.price && state.compensation && state.flight && state.delay) {
			let minDay = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
			if (moment(state.flight.split(' ')[1], "DD.MM.YYYY").valueOf() >= minDay) {
				if (moment(state.flight.split(' ')[1], "DD.MM.YYYY").valueOf() <= moment().add(conf.maxMonthsBeforeFlight, 'month').valueOf()) {
					return getLastAddress((myAddress) => {
						offerFlightDelaysContract(myAddress, moment(state.flight.split(' ')[1], "DD.MM.YYYY"), {
							peerAddress: ucText,
							peerDeviceAddress: from_address,
							peerAmount: state.price,
							myAmount: state.compensation - state.price,
							asset: 'base',
							flight: state.flight,
							relation: '>',
							feedValue: state.delay,
							expiry: 1, //days
							timeout: 4 //hours
						}, function (err, paymentRequestText) {
							if (err) {
								console.error(new Error('offerContract error: ' + JSON.stringify(err)));
								notifications.notifyAdmin('offerContract error', JSON.stringify(err));
								return device.sendMessageToDevice(from_address, 'text', texts.errorOfferContract());
							}
							state.flight = null;
							state.delay = null;
							state.compensation = null;
							state.save();
							return device.sendMessageToDevice(from_address, 'text', paymentRequestText);
						});
					});
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

		if (/\b[A-Z0-9]{2}(\s*)\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/.test(ucText)) {
			let flight = ucText.match(/\b[A-Z0-9]{2}(\s*)\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/)[0];
			ucText = ucText.replace(flight, '').trim();
			flight = flight.replace(flight.match(/\b[A-Z0-9]{2}(\s*)\d{1,4}([A-Z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/)[1], '');
			let arrFlightMatches = flight.split(' ')[0].match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);

			if (flight && moment(flight.split(' ')[1], "DD.MM.YYYY").isValid()) {
				let minDay = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
				if (moment(flight.split(' ')[1], "DD.MM.YYYY").valueOf() >= minDay) {
					if (moment(flight.split(' ')[1], "DD.MM.YYYY").valueOf() <= moment().add(conf.maxMonthsBeforeFlight, 'month').valueOf()) {
						if (conf.nonInsurableAirlines.indexOf(arrFlightMatches[1]) === -1 && conf.nonInsurableFlights.indexOf(flight.split(' ')[0].toUpperCase()) === -1) {
							state.flight = flight.toUpperCase();
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
		}

		if (/\b[0-9]+,[0-9]+\b/.test(ucText)) ucText = ucText.replace(',', '.');
		if (/\b[0-9]+(\.[0-9]+)?\b/.test(ucText)) {
			let compensation = parseFloat(ucText.match(/\b[0-9]+(\.[0-9]+)?\b/)[0]);
			ucText = ucText.replace(ucText.match(/\b[0-9]+(\.[0-9]+)?\b/)[0], '').trim();
			if (compensation > conf.maxCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMaxCompensation());
			} else if (compensation < conf.minCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMinCompensation());
			}
			state.compensation = compensation;
		}

		state.save();

		if (!state.flight) return device.sendMessageToDevice(from_address, 'text', texts.flight());
		if (!state.delay) return device.sendMessageToDevice(from_address, 'text', texts.delay());
		if (!state.compensation) return device.sendMessageToDevice(from_address, 'text', texts.compensation());

		if (/OK/.test(ucText)) {
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

function getLastAddress(cb) {
	headlessWallet.readSingleWallet((wallet) => {
		db.query("SELECT address FROM my_addresses WHERE wallet=? ORDER BY creation_date DESC LIMIT 0, 1", [wallet], (rows) => {
			cb(rows[0].address);
		});
	});
}

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

function getMyAddressFromContract(shared_address, cb) {
	let device = require('byteballcore/device');
	db.query("SELECT address FROM shared_address_signing_paths WHERE shared_address = ? AND device_address = ? LIMIT 0,1", [shared_address, device.getMyDeviceAddress()], (rows)=>{
		cb(rows[0].address);
	})
}

eventBus.on('headless_wallet_ready', () => {
	let error = '';
	let arrDbName = ['flightstats_ratings', 'states', 'contracts'];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?)", [arrDbName], (rows) => {
			if (rows.length !== arrDbName.length) error += texts.errorInitSql();

			if (conf.useSmtp && (!conf.smtpUser || !conf.smtpPassword || !conf.smtpHost)) error += texts.errorSmtp();

			if (!conf.admin_email || !conf.from_email) error += texts.errorEmail();

			if (conf.analysisOfRealTimeDelays && (!conf.flightstats.appId || !conf.flightstats.appKey || !conf.profitMargin)) error += texts.errorFlightstats();

			if (error) {
				console.error(new Error(error));
				process.exit(1);
			}

			getLastAddress((address) => {
				my_address = address;

				setInterval(contract.checkAndRefundContractsTimeout, 3600 * 1000);
				contract.checkAndRefundContractsTimeout();
			});

			correspondents.findCorrespondentByPairingCode(conf.oracle_pairing_code, (correspondent) => {
				if (!correspondent) {
					correspondents.addCorrespondent(conf.oracle_pairing_code, 'flight oracle', (err, device_address) => {
						if (err) {
							console.error(new Error(error));
							process.exit(1);
						}
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
		}
	);
});