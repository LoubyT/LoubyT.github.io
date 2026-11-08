'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const live = fs.readFileSync(path.join(root, 'live-config.js'), 'utf8');
const stagingCfg = fs.readFileSync(path.join(root, 'staging-config.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const staging = fs.readFileSync(path.join(root, 'staging.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.match(live, /enabled:\s*false/);
assert.doesNotMatch(live, /enabled:\s*true/);
assert.match(stagingCfg, /enabled:\s*true/);
assert.match(stagingCfg, /endpoint:\s*null/);
assert.doesNotMatch(index, /staging-config\.js/);
assert.doesNotMatch(index, /staging\.html/);
assert.doesNotMatch(app, /staging-config|staging\.html/);

const configAt = staging.indexOf('staging-config.js');
const liveAt = staging.indexOf('live-config.js');
assert.ok(configAt > 0 && liveAt > configAt, 'staging config must load before the public switch');
assert.match(staging, /id="stagingMark"/);
assert.match(staging, /noindex/);

const linked = fs.readdirSync(root).filter((name) => name.endsWith('.html') && name !== 'staging.html');
linked.forEach((name) => {
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  assert.doesNotMatch(text, /staging\.html/, name + ' links the staging page');
});

console.log('ok staging switch');
