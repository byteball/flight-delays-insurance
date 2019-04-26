/*jslint node: true */
'use strict';
const desktopApp = require('ocore/desktop_app.js');
const conf = require('ocore/conf');
const moment = require('moment');

exports.invalidDate = () => {
	return 'Invalid date entered';
};

exports.criticalWeather = () => {
	return 'The insurance is denied due to critical weather.';
};

exports.flight = () => {
	return `Please write the flight number and date in DD.MM.YYYY format.\n\nExample: BA950 ${moment().add(4, 'days').format("DD.MM.YYYY")}`;
};

exports.delay = () => {
	let timeButtons = '';
	conf.delayTime.forEach((value) => {
		timeButtons += `[${value.text}](command:${value.minutes} minutes)\t`;
	});

	return `Choose the delay time. You'll be paid if the actual delay is larger or the flight is canceled.\n${timeButtons}`;
};

exports.compensation = () => {
	return `How much do you want to receive in case of flight delay? (${conf.defaultAssetName})`;
};

exports.insertMyAddress = () => {
	return 'To continue, send me your address (click ... and Insert my address).';
};

exports.edit = () => {
	return `What would you like to change?
            [Flight](command:flight)\t[Delay](command:delay)\t[Compensation](command:compensation)`;
};

exports.total = (flight, delay, compensation, price) => {
	return `Flight: ${flight}\nDelay: ${delay} minutes\nCompensation: ${compensation} ${conf.defaultAssetName}\n-----------------------------\nPrice: ${price} ${conf.defaultAssetName}\n[Buy](command:${flight} ${delay} minutes ${compensation} buy)\t[Edit](command:edit)`;
};

exports.arrivedOnTime = () => {
	return 'Congratulations, your flight arrived on time.';
};

exports.pleaseUnlock = () => {
	return 'Your flight was delayed, please withdraw your funds from the insurance smart address.';
};

exports.weSentPayment = () =>{
	return 'Your flight was delayed, we sent you your compensation.';
};

//errors
exports.errorInitSql = () => {
	return 'please import insurance.sql file\n';
};

exports.errorEmail = () => {
	return `please specify admin_email and from_email in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorFlightstats = () => {
	return `please specify flightstats.appId, flightstats.appKey and profitMargin\n`;
};

exports.errorMaxCompensation = () => {
	return `Max compensation: ${conf.maxCompensation} ${conf.defaultAssetName}`;
};

exports.errorMinCompensation = () => {
	return `Min compensation: ${conf.minCompensation} ${conf.defaultAssetName}`;
};

exports.errorValidAddress = () => {
	return 'Please send a valid address';
};

exports.errorValidDate = () => {
	return 'Please enter a valid date in the format DD.MM.YYYY';
};

exports.errorOfferContract = () => {
	return 'An error occurred while creating the contract, please try again in 10 minutes.';
};

exports.errorNonInsurable = () => {
	return 'Unfortunately we do not insure this flight.';
};

exports.errorMinDaysBeforeFlight = (days) => {
	return "Minimum days before flight: " + days;
};

exports.errorMaxMonthsBeforeFlight = (months) => {
	return "Maximum months before flight: " + months;
};
