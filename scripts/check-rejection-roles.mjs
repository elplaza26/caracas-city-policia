import assert from 'node:assert/strict';
import {REJECTION_ROLE_IDS, syncRejectionRole, clearRejectionRoles} from '../supabase/functions/prime-police-panel/rejection-roles.ts';
for (const attempt of [1, 2, 3]) {
  const roles = new Set(['unrelated', ...REJECTION_ROLE_IDS.slice(0, attempt - 1)]);
  const calls = [];
  const discord = async (url, init) => {
    if (!init) return {roles: [...roles]};
    const role = url.split('/').pop(); calls.push([init.method, role]);
    if (init.method === 'PUT') roles.add(role); else roles.delete(role);
  };
  assert.equal(await syncRejectionRole('guild', 'user', attempt, discord), '');
  assert.deepEqual([...roles].sort(), ['unrelated', REJECTION_ROLE_IDS[attempt - 1]].sort());
  assert.equal(calls[0][0], 'PUT');
  calls.length = 0;
  assert.equal(await syncRejectionRole('guild', 'user', attempt, discord), '');
  assert.equal(calls.length, 0);
}
const mutations = [];
const warning = await syncRejectionRole('guild', 'user', 2, async (url, init) => {
  if (!init) return {roles: [REJECTION_ROLE_IDS[0]]};
  mutations.push(init.method); throw Error('Discord 403');
});
assert(warning.includes('El rechazo se guardó'));
assert.deepEqual(mutations, ['PUT']); // Keep the old marker if the new one could not be granted.
let invalidCalled = false;
assert(await syncRejectionRole('guild', 'user', 4, async () => {invalidCalled = true;}));
assert.equal(invalidCalled, false);
console.log('Rejection roles 1/2/3, replacement, unrelated roles, retries and Discord failure: PASS');
const acceptedRoles = new Set(['unrelated', ...REJECTION_ROLE_IDS]);
const cleanup = async (url, init) => {if(!init)return {roles:[...acceptedRoles]};assert.equal(init.method,'DELETE');acceptedRoles.delete(url.split('/').pop());};
assert.equal(await clearRejectionRoles('guild','user',cleanup),'');
assert.deepEqual([...acceptedRoles],['unrelated']);
assert.equal(await clearRejectionRoles('guild','user',cleanup),'');
console.log('Acceptance removes all rejection markers, preserves other roles and tolerates retries: PASS');
