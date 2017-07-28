/*jslint node: true */
'use strict';

const db = require('byteballcore/db');
const device = require('byteballcore/device');
const headlessWallet = require('headless-byteball');
const async = require('async');
const conf = require('byteballcore/conf');
const notifications = require('./notifications.js');

function getMyAddressFromContract(shared_address, cb) {
	db.query("SELECT address FROM shared_address_signing_paths WHERE shared_address = ? AND device_address = ? LIMIT 0,1", [shared_address, device.getMyDeviceAddress()], (rows)=>{
		cb(rows[0].address);
	})
}

exports.getMyAddressFromContract = getMyAddressFromContract;

exports.checkAndRefundContractsTimeout = () => {
	db.query(
		"SELECT shared_address, peer_amount FROM data_feeds, contracts \n\
		WHERE unit IN (\n\
			SELECT unit_authors.unit FROM unit_authors JOIN units USING(unit)\n\
			WHERE address = ? \n\
			AND units.is_stable = 1\n\
			ORDER BY unit_authors.rowid DESC LIMIT 0,1\n\
		)\n\
		AND data_feeds.feed_name = 'timestamp'\n\
		AND contracts.checked_timeout_date IS NULL \n\
		AND contracts.timeout < data_feeds.int_value", 
		[conf.TIMESTAMPER_ADDRESS], 
		rows => {
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
					db.query("UPDATE contracts SET checked_timeout_date="+db.getNow()+", refunded=0 WHERE shared_address IN (?)", [arrFullyFundedAddresses]);

				if (!arrAddressesToRefund.length) return;
				async.each(arrAddressesToRefund, (address, callback) => {
					getMyAddressFromContract(address, myAddress => {
						headlessWallet.sendAllBytesFromAddress(address, myAddress, null, (err, unit) => {
							if (err) {
								notifications.notifyAdmin('timeout refund failed', err);
								arrAddressesToRefund.splice(arrAddressesToRefund.indexOf(address), 1);
							}else {
								db.query("UPDATE contracts SET checked_timeout_date="+db.getNow()+", refunded = 1, unlock_unit=? WHERE shared_address=?", [unit, address]);
							}
							callback();
						});
					});
				});
			});
		}
	);
};

exports.getListOfContactsForVerification = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout_date IS NOT NULL AND refunded = 0 AND checked_flight_date IS NULL AND date < " + db.addTime('-2 days'), cb);
};

exports.getContractsByFeedName = (feed_name, cb) => {
	db.query("SELECT * FROM contracts WHERE feed_name=?", [feed_name], cb);
};

exports.setWinner = (feed_name, winner) => {
	db.query("UPDATE contracts SET checked_flight_date="+db.getNow()+", winner = ? WHERE feed_name = ?", [winner, feed_name], () => {});
};

exports.getContractsToRetryUnlock = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout_date IS NOT NULL AND checked_flight_date IS NOT NULL AND unlocked_date IS NULL", cb)
};

exports.setUnlockedContract = (shared_address, unit) => {
	db.query("UPDATE contracts SET unlocked_date="+db.getNow()+", unit=? WHERE shared_address = ?", [unit, shared_address], () => {});
};