'use strict';

var fs = require('fs');
var path = require('path');
var monitor = require('./monitor-contract');

var file = path.resolve(__dirname, '../elf-companion-private/monitor-config.json');
var config = null;
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { config = null; }

var result = monitor.runRoutine(new Date(), config, { implemented: false });
var check = config ? monitor.validateConfig(config) : { ok: false, errors: ['missing'] };
process.stdout.write(JSON.stringify({
  configFile: 'elf-companion-private/monitor-config.json',
  configOk: check.ok,
  readiness: config && config.readiness || 'not-configured',
  routine: result
}, null, 2) + '\n');
if (!check.ok || result.sent || result.reason !== 'not-connected') process.exit(1);
