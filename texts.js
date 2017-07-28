/*jslint node: true */
'use strict';
const desktopApp = require('byteballcore/desktop_app.js');
const conf = require('byteballcore/conf');
const moment = require('moment');


exports.flight = () => {
	return `Please write the name of the flight. (Example: BA950 ${moment().add(1, 'days').format("DD.MM.YYYY")})`;
};

exports.delay = () => {
	let timeButtons = '';
	conf.delayTime.forEach((value) => {
		timeButtons += `[${value.text}](command:${value.minutes} minutes)\t`;
	});

	return `Delay time:
            ${timeButtons}`;
};

exports.compensation = () => {
	return `How much do you want to receive in case of flight delay? (${conf.defaultNameAsset})`;
};

exports.insertMyAddress = () => {
	return 'To continue, send me your address. (Insert my address)';
};

exports.edit = () => {
	return `What do you want to change?
            [Flight](command:flight)\t[Delay](command:delay)\t[Compensation](command:compensation)`;
};

exports.total = (flight, delay, compensation, price) => {
	return `Flight: ${flight}\nDelay: ${delay} minutes\nCompensation: ${compensation} ${conf.defaultNameAsset}\n-----------------------------\nPrice: ${price} ${conf.defaultNameAsset}\n[OK](command:${flight} ${delay} minutes ${compensation} ok)\t[Edit](command:edit)`;
};

exports.arriveOnTime = () => {
	return 'Congratulations on the arrival on time.';
};

exports.contractStable = () => {
	return 'You can withdraw funds from the contract.';
};

exports.weSentPayment = () =>{
	return 'We sent you a payment of money from insurance.';
};

//errors
exports.errorInitSql = () => {
	return 'please import init.sql file\n';
};

exports.errorSmtp = () => {
	return `please specify smtpUser, smtpPassword and smtpHost in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorEmail = () => {
	return `please specify admin_email and from_email in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorFlightstats = () => {
	return `please specify flightstats.appId, flightstats.appKey and profitMargin\n`;
};

exports.errorMaxCompensation = () => {
	return `Max compensation: ${conf.maxCompensation} ${conf.defaultNameAsset}`;
};

exports.errorMinCompensation = () => {
	return `Min compensation: ${conf.minCompensation} ${conf.defaultNameAsset}`;
};

exports.errorValidAddress = () => {
	return 'Please send a valid address';
};

exports.errorValidDate = () => {
	return 'Please enter a valid date';
};

exports.errorOfferContract = () => {
	return 'An error occurred while creating the contract, please try again later';
};

exports.errorNonInsurable = () => {
	return 'Unfortunately we do not insure this flight.';
};

exports.errorMinDaysBeforeFlight = (days) => {
	return "Minimum days before flight: " + days;
};

exports.errorMaxMonthsBeforeFlight = (months) => {
	return "Maximum month before flight: " + months;
};