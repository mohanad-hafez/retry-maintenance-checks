const{test}=require('node:test'),assert=require('node:assert/strict'),{specRefs}=require('./postmerge.cjs');
test('explicit same-repo closing and provenance references deduplicate',()=>assert.deepEqual(specRefs('Fixes #923\nSpec issue: #923\nCloses #14'),[14,923]));
test('related references are not closing authority',()=>assert.deepEqual(specRefs('Related: #1366 and #1381\nSee #23'),[]));
test('code examples do not cause closeout',()=>assert.deepEqual(specRefs('```\nFixes #12\n```\nResolves #3'),[3]));
test('invalid and cross-repository references do not become local targets',()=>assert.deepEqual(specRefs('Fixes #0\nFixes other/repo#12\nFixes https://github.com/other/repo/issues/14'),[]));
