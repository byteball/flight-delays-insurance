/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf.js');
const mail = require('byteballcore/mail.js');


function notifyAdmin(subject, body) {
	console.log('notifyAdmin:\n' + subject + '\n' + body);
	mail.sendmail({
		to: conf.admin_email,
		from: conf.from_email,
		subject: subject,
		body: body
	});
}

exports.notifyAdmin = notifyAdmin;