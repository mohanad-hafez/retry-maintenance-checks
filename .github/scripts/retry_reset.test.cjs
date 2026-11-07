const {test}=require('node:test'),assert=require('node:assert/strict');
const {targetNumber,selectLoopPR}=require('./retry_reset.cjs');
test('command target and context are exact numbers',()=>{assert.equal(targetNumber('/retry',14),14);assert.equal(targetNumber('/retry #140\nignored prose',14),140);assert.equal(targetNumber('/retry 7',14),7);});
test('unrecognized command and unsafe target fail',()=>{for(const s of ['/retry all','please /retry','/retryx','/retry 0','/retry 99999999999999999'])assert.throws(()=>targetNumber(s,14));});
const pr=(n=14)=>({number:2,state:'open',head:{ref:`devloop/issue-${n}`,repo:{full_name:'o/r'}},user:{type:'Bot',login:'github-actions[bot]'}});
test('exact native branch distinguishes14from140',()=>assert.equal(selectLoopPR([pr(140),pr(14)],14,'o/r','o').number,2));
test('foreign and closed PRs are excluded',()=>{const p=pr();p.head.repo.full_name='foreign/r';assert.equal(selectLoopPR([p],14,'o/r','o'),null);const c=pr();c.state='closed';assert.equal(selectLoopPR([c],14,'o/r','o'),null);});
test('multiple matching PRs and untrusted authors fail',()=>{assert.throws(()=>selectLoopPR([pr(),pr()],14,'o/r','o'));const p=pr();p.user={type:'User',login:'someone'};assert.throws(()=>selectLoopPR([p],14,'o/r','o'));});
test('repository owner controlled record is accepted without forged bot provenance',()=>{const p=pr();p.user={type:'User',login:'o'};assert.equal(selectLoopPR([p],14,'o/r','o'),p);});
