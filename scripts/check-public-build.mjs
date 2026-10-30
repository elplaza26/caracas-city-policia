import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const files=(await fs.readdir('dist')).sort();assert.deepEqual(files,['.nojekyll','assets','icon.svg','index.html','manifest.webmanifest']);
const assets=await fs.readdir('dist/assets');assert.equal(assets.length,2);assert(assets.every(f=>/^app\.[a-f0-9]{12}\.(js|css)$/.test(f)));
const html=await fs.readFile('dist/index.html','utf8');assert(!html.includes('src="app.js'));assert(!html.includes('supabase/functions'));assert.equal((html.match(/<script /g)||[]).length,1);
for(const filename of assets){const body=await fs.readFile('dist/assets/'+filename,'utf8');assert(!body.includes('sourceMappingURL'));assert(!body.includes('PANEL_SESSION_SIGNING_KEY'));assert(!body.includes('SUPABASE_SERVICE_ROLE_KEY'));}
const digest=bytes=>'sha384-'+createHash('sha384').update(bytes).digest('base64');
for(const filename of assets){
 const expected=digest(await fs.readFile('dist/assets/'+filename));
 assert(html.includes('assets/'+filename+'" integrity="'+expected+'" crossorigin="anonymous"'));
 if(filename.endsWith('.js'))assert(html.includes("script-src '"+expected+"'; script-src-attr 'none';"));
}
assert(!html.includes("script-src 'self'"));assert(!html.includes("'unsafe-eval'"));
console.log('Public artifact allowlist, single compact script, no backend credentials/names or source maps: PASS');
