/*jslint node: true */
"use strict";

exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.storage = 'sqlite';


exports.hub = 'byteball.org/bb';
exports.deviceName = 'Flight Delay Insurance';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.bIgnoreUnpairRequests = true;
exports.bSingleAddress = false;
exports.KEYS_FILENAME = 'keys.json';

//email
exports.useSmtp = false;

//contract
exports.oracle_address = 'GFK3RDAPQLLNCMQEVGGD2KCPZTLSG3HN';
exports.oracle_pairing_code = 'AuP4ngdv0S/rok+IaW1q2D6ye72eXLl3h+CqXNXzkBXn@byteball.org/bb#0000';
exports.TIMESTAMPER_ADDRESS = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'; // isTestnet ? 'OPNUXBRSSQQGHKQNEPD2GLWQYEUY5XLD' : 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'


//flightstats API
exports.flightstats = {appId: '', appKey: ''};


//buttons
exports.delayTime = [
	{minutes: 30, text: '30 minutes'},
	{minutes: 60, text: '1 hour'},
	{minutes: 60 * 2, text: '2 hours'},
	{minutes: 60 * 4, text: '4 hours'}
];

//bot
exports.contractTimeout = 1; // hours
exports.contractExpiry = 2; //days

exports.defaultPriceInPercent = {
	gt0: 100,
	gt15: 30,
	gt30: 20,
	gt45: 15
};

exports.defaultAsset = 'base';
exports.defaultAssetName = ''; // change if you want to give your name of asset
exports.unitValue = 1000000000; //GB
exports.minCompensation = 0.00001; //GB - 0.00001 - 10000 bytes
exports.maxCompensation = 1; //GB

exports.minDaysBeforeFlight = 3;
exports.maxMonthsBeforeFlight = 3;

exports.analysisOfRealTimeDelays = true;
exports.minObservations = 10;
exports.profitMargin = 5; //% if using analysisOfRealTimeDelays
exports.maxPriceInPercent = 90;

exports.nonInsurableFlights = ['BA0000'];
exports.nonInsurableAirlines = ['ZZ'];

exports.coefficientsForFlight = {SU0000: 1.2};
exports.coefficientsForAirline = {SU: 1.2};


if(!exports.defaultAssetName) {
	if (exports.defaultAsset === 'base') exports.defaultAssetName = 'GB';
	else exports.defaultAssetName = exports.defaultAsset;
}
