const assert = require('node:assert/strict');
const fs = require('node:fs');

const expected = {
  target: 1, close_pr: 2, close_reason: 'stale PR closed by /retry (human sanction)', budget: 'gh-aw budget: reset',
  change_labels: false, next_steps: ['invoke_plan', 'reapply_human_label'],
};
let result;
if (process.env.ARM === 'agent') {
  const calls = fs.readFileSync('evidence/tools.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
  assert(calls.every(call => !call.error));
  assert.equal(calls.at(-1).name, 'publish_result');
  result = JSON.parse(calls.at(-1).args.body);
} else {
  result = JSON.parse(fs.readFileSync('evidence/result.json'));
}
assert.deepEqual({ ...result, next_steps: [...result.next_steps].sort() }, expected);
fs.writeFileSync('evidence/result.json', JSON.stringify(expected));
