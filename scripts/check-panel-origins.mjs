import assert from 'node:assert/strict';
import {PANEL_SITE_URL, isPanelOrigin, panelResponseHeaders} from '../supabase/functions/prime-police-panel/site-config.ts';

assert.equal(PANEL_SITE_URL, 'https://primepolice.link/');
for (const origin of ['https://primepolice.link']) {
  assert(isPanelOrigin(origin));
  for (const oldValue of ['https://primepolicerp.github.io', 'https://primepolice.link']) {
    const headers = panelResponseHeaders({'Access-Control-Allow-Origin': oldValue, Vary: 'Accept-Encoding'}, origin);
    assert.equal(headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(headers.get('Vary'), 'Accept-Encoding, Origin');
  }
}
for (const origin of ['https://primepolicerp.github.io', 'http://primepolice.link', 'https://primepolice.link.evil.test', 'https://evil.test', 'null', null]) {
  if (origin) assert(!isPanelOrigin(origin));
  assert.equal(panelResponseHeaders({'Access-Control-Allow-Origin': 'https://primepolicerp.github.io'}, origin).get('Access-Control-Allow-Origin'), null);
}
console.log('Panel domain allowlist and response headers: PASS');
