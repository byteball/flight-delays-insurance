/*jslint node: true */
"use strict";
var check_daemon = require('ocore/check_daemon.js');

check_daemon.checkDaemonAndNotify('node insurance.js');

