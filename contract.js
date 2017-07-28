/*jslint node: true */
'use strict';

const db = require('byteballcore/db');
const device = require('byteballcore/device');
const headlessWallet = require('headless-byteball');
const async = require('async');
const conf = require('byteballcore/conf');

exports.checkAndRefundContractsTimeout = () => {
	db.query("SELECT shared_address, peer_amount FROM data_feeds, contracts WHERE unit IN (\n\
		SELECT unit_authors.unit FROM unit_authors JOIN units USING(unit)\n\
		WHERE address = ? \n\
		AND units.is_stable = 1\n\
		ORDER BY unit_authors.rowid DESC LIMIT 0,1\n\
		)\n\
		AND data_feeds.feed_name = 'timestamp'\n\
		AND contracts.checked_timeout = 0\n\
		AND contracts.timeout < data_feeds.int_value", [conf.TIMESTAMPER_ADDRESS], (rows) => {
		console.error(new Error(rows.length));
		if (!rows.length) return;
		let arrAddressesToRefund = [];
		let arrFullyFundedAddresses = [];

		async.each(rows, (row, callback) => {
			db.query("SELECT address, amount FROM outputs JOIN units USING(unit) \n\
				WHERE address = ? AND amount = ? AND is_stable = 1 AND sequence = 'good'", [row.shared_address, row.peer_amount], (rows2) => {
				if (rows2.length) {
					arrFullyFundedAddresses.push(row.shared_address);
				} else {
					arrAddressesToRefund.push(row.shared_address);
				}
				callback();
			});
		}, () => {
			if (arrFullyFundedAddresses.length)
				db.query("UPDATE contracts SET checked_timeout = 1, refunded = 0 WHERE shared_address IN (?)", [arrFullyFundedAddresses], () => {});

			if (!arrAddressesToRefund.length) return;
			headlessWallet.issueOrSelectNextMainAddress((myAddress) => {
				async.each(arrAddressesToRefund, (address, callback) => {
					headlessWallet.sendAllBytesFromAddress(address, myAddress, null, (err) => {
						if (err) {
							console.error(new Error(err));
							arrAddressesToRefund.splice(arrAddressesToRefund.indexOf(address), 1);
						}else {
							db.query("UPDATE contracts SET checked_timeout = 1, refunded = 1 WHERE shared_address =?", [address], () => {});
						}
						callback();
					});
				});
			});
		});
	});
};

exports.getListOfContactsForVerification = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout = 1 AND refunded = 0 AND checked_flight = 0 AND date < " + db.addTime('-2 days'), cb);
};

exports.getContractsByFeedName = (feed_name, cb) => {
	db.query("SELECT * FROM contracts WHERE feed_name=?", [feed_name], cb);
};

exports.setWinner = (feed_name, winner) => {
	db.query("UPDATE contracts SET checked_flight = 1, winner = ? WHERE feed_name = ?", [winner, feed_name], () => {});
};

exports.getContractsToRetryUnlock = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout = 1 AND checked_flight = 1 AND unlocked = 0", cb)
};

exports.setUnlockedContract = (shared_address) => {
	db.query("UPDATE contracts SET unlocked = 1 WHERE shared_address = ?", [shared_address], () => {});
};