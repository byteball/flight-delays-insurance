/*jslint node: true */
'use strict';
const conf = require('ocore/conf');
const headlessWallet = require('headless-obyte');
const db = require('ocore/db');
const moment = require('moment');
const constants = require('ocore/constants');


module.exports = (myAddress, event_date, contract, cb) => {
	let device = require('ocore/device.js');

	let defaultContract = {
		timeout: conf.contractTimeout,
		myAsset: conf.defaultAsset,
		peerAsset: conf.defaultAsset,
		peer_pays_to: 'contract',
		relation: '>',
		reverseRelation: '<=',
		expiry: conf.contractExpiry,
		data_party: 'peer',
		expiry_party: 'me'
	};

	for (let key in defaultContract) {
		if (contract[key] === undefined) contract[key] = defaultContract[key];
	}

	if (contract.myAsset === "base") contract.myAmount *= conf.unitValue;
	if (contract.peerAsset === "base") contract.peerAmount *= conf.unitValue;

	contract.myAmount = Math.round(contract.myAmount);
	contract.peerAmount = Math.round(contract.peerAmount);
	if (contract.myAmount === contract.peerAmount) {
		contract.myAmount += 1;
	}

	readLastMainChainIndex((err, last_mci) => {
		if (err) return cb(err);
		let arrSeenCondition = ['seen', {
			what: 'output',
			address: (contract.peer_pays_to === 'contract') ? 'this address' : myAddress,
			asset: contract.peerAsset,
			amount: contract.peerAmount
		}];

		let arrEventCondition = ['in data feed', [[conf.oracle_address], contract.feed_name, contract.relation, contract.feedValue + '', last_mci]];
		let data_address = (contract.data_party === 'me') ? myAddress : contract.peerAddress;
		let expiry_address = (contract.expiry_party === 'me') ? myAddress : contract.peerAddress;
		let data_device_address = (contract.data_party === 'me') ? device.getMyDeviceAddress() : contract.peerDeviceAddress;
		let expiry_device_address = (contract.expiry_party === 'me') ? device.getMyDeviceAddress() : contract.peerDeviceAddress;
		let timeout = Date.now() + Math.round(contract.timeout * 3600 * 1000);
		let arrReverseCondition = ['in data feed', [[conf.oracle_address], contract.feed_name, contract.reverseRelation, contract.feedValue + '', last_mci]];
		let arrMyCondition = (contract.peerAsset === "base") 
			? arrReverseCondition 
			: ['or', [
				arrReverseCondition,
				['and', [
					arrEventCondition,
					['has', {
						what: 'output',
						asset: contract.peerAsset,
						address: data_address,
						amount: contract.peerAmount + contract.myAmount
					}]
				]]
			]];
		let arrDefinition = ['or', [
			['and', [
				arrSeenCondition,
				['or', [
					['and', [
						['address', data_address],
						arrEventCondition
					]],
					['and', [
						['address', expiry_address],
						['in data feed', [[conf.TIMESTAMPER_ADDRESS], 'timestamp', '>', moment(event_date, 'DD.MM.YYYY').valueOf() + Math.round(contract.expiry * 24 * 3600 * 1000)]]
					]],
					['and', [
						['address', myAddress],
						arrMyCondition
					]]
				]]
			]],
			['and', [
				['address', myAddress],
				['not', arrSeenCondition],
				['in data feed', [[conf.TIMESTAMPER_ADDRESS], 'timestamp', '>', timeout]]
			]]
		]];
		let assocSignersByPath = {
			'r.0.1.0.0': {
				address: data_address,
				member_signing_path: 'r',
				device_address: data_device_address
			},
			'r.0.1.1.0': {
				address: expiry_address,
				member_signing_path: 'r',
				device_address: expiry_device_address
			},
			'r.0.1.2.0': {
				address: myAddress,
				member_signing_path: 'r',
				device_address: device.getMyDeviceAddress()
			},
			'r.1.0': {
				address: myAddress,
				member_signing_path: 'r',
				device_address: device.getMyDeviceAddress()
			}
		};

		let walletDefinedByAddresses = require('ocore/wallet_defined_by_addresses.js');
		walletDefinedByAddresses.createNewSharedAddress(arrDefinition, assocSignersByPath, {
			ifError: (err) => {
				cb(err);
			},
			ifOk: (shared_address) => {
				headlessWallet.issueChangeAddressAndSendPayment(contract.myAsset, contract.myAmount, shared_address, contract.peerDeviceAddress, (err, unit) => {
					if (err) return cb(err);
					let arrPayments = [{
						address: shared_address,
						amount: contract.peerAmount,
						asset: contract.peerAsset
					}];
					let assocDefinitions = {};
					assocDefinitions[shared_address] = {
						definition: arrDefinition,
						signers: assocSignersByPath
					};
					let objPaymentRequest = {payments: arrPayments, definitions: assocDefinitions};
					let paymentJson = JSON.stringify(objPaymentRequest);
					let paymentJsonBase64 = Buffer(paymentJson).toString('base64');
					let paymentRequestCode = 'payment:' + paymentJsonBase64;
					let paymentRequestText = '[your share of payment to the contract](' + paymentRequestCode + ')';
					cb(null, paymentRequestText, shared_address, timeout);
				});
			}
		});
	});
};

function readLastMainChainIndex(cb) {
	if (conf.bLight) {
		let network = require('ocore/network.js');
		network.requestFromLightVendor('get_last_mci', null, (ws, request, response) => {
			response.error ? cb(response.error) : cb(null, response);
		});
	}
	else {
		let storage = require('ocore/storage');
		storage.readLastMainChainIndex((last_mci) => {
			cb(null, last_mci);
		});
	}
}