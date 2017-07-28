#!/bin/sh
sed -ie "s/version = '1.0'/version = '1.0t'/; s/alt = '1'/alt = '2'/" node_modules/byteballcore/constants.js
sed -ie "s/.hub = 'byteball.org\/bb'/.hub = 'byteball.org\/bb-test'/" conf.js
