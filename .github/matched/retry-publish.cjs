const assert = require('node:assert/strict');
const fs = require('node:fs');
const { reset } = require('./retry_reset.cjs');

module.exports = async function publish({ github, context }) {
  assert.deepEqual(context.repo, { owner: 'mohanad-hafez', repo: 'retry-maintenance-checks' });
  const arm = process.env.ARM;
  assert(['agent', 'script'].includes(arm));
  const target = JSON.parse(fs.readFileSync('.github/matched/retry-targets.json'))[arm];
  const decision = JSON.parse(fs.readFileSync('evidence/result.json'));
  assert.deepEqual(decision, {
    target: 1, close_pr: 2, close_reason: 'stale PR closed by /retry (human sanction)', budget: 'gh-aw budget: reset',
    change_labels: false, next_steps: ['invoke_plan', 'reapply_human_label'],
  });
  const observed = JSON.parse(fs.readFileSync('evidence/input-readback.json'));
  assert.deepEqual(observed.target, target);
  const pr = (await github.rest.pulls.get({ ...context.repo, pull_number: target.pr })).data;
  assert.equal(pr.head.sha, target.sha);
  assert.equal(pr.state, 'open');
  const output = await reset({ github, context, commentId: target.command, output: 'publication.json', expected: target });
  assert.equal(output.status, 'applied');
  assert.equal(output.target, target.issue);
  assert.equal(output.selected_pr.number, target.pr);
};
