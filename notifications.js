/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf.js');
const mail = require('byteballcore/mail.js');
const emailjs = require('emailjs');

let server;

if (conf.useSmtp) {
	server = emailjs.server.connect({
		user: conf.smtpUser,
		password: conf.smtpPassword,
		host: conf.smtpHost,
		ssl: true
	});
}

function notifyAdmin(subject, body) {
	console.log('notifyAdmin:\n' + subject + '\n' + body);
	if (conf.useSmtp) {
		server.send({
			text: body,
			from: 'Server <' + conf.from_email + '>',
			to: 'You <' + conf.admin_email + '>',
			subject: subject
		}, function (err) {
			if (err) console.error(new Error(err));
		});
	} else {
		mail.sendmail({
			to: conf.admin_email,
			from: conf.from_email,
			subject: subject,
			body: body
		});
	}
}

exports.notifyAdmin = notifyAdmin;