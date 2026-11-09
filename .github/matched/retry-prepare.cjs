const assert = require('node:assert/strict');
const fs = require('node:fs');
const { targetNumber, selectLoopPR } = require('./retry_reset.cjs');

module.exports = async function prepare({ github, context }) {
  const repository = context.repo.owner + '/' + context.repo.repo;
  assert.equal(repository, 'mohanad-hafez/retry-maintenance-checks');
  const arm = process.env.ARM;
  assert(['agent', 'script'].includes(arm));
  const target = JSON.parse(fs.readFileSync('.github/matched/retry-targets.json'))[arm];
  const comment = (await github.rest.issues.getComment({ ...context.repo, comment_id: target.command })).data;
  assert.equal(comment.user.login, context.repo.owner);
  assert.equal(comment.user.type, 'User');
  assert.equal(comment.issue_url, 'https://api.github.com/repos/' + repository + '/issues/' + target.issue);
  const permission = (await github.rest.repos.getCollaboratorPermissionLevel({ ...context.repo, username: comment.user.login })).data.permission;
  assert(['admin', 'maintain', 'write'].includes(permission));
  const issue = (await github.rest.issues.get({ ...context.repo, issue_number: target.issue })).data;
  assert.equal(issue.state, 'open');
  assert(!issue.pull_request);
  assert.deepEqual(issue.labels, []);
  const history = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: target.issue, per_page: 100 });
  assert.deepEqual(history.map(row => row.body), [target.attempt, '/retry']);
  const prs = await github.paginate(github.rest.pulls.list, { ...context.repo, state: 'open', per_page: 100 });
  const expected = prs.find(row => row.number === target.pr);
  assert(expected);
  assert.equal(expected.head.sha, target.sha);
  assert.equal(expected.head.repo.full_name, repository);
  assert.equal(expected.head.ref, 'devloop/issue-' + target.issue);
  assert.equal(expected.user.login, context.repo.owner);
  const result = {
    inputs: {
      issue: { number: 1, state: issue.state, labels: [], budget_history: [history[0].body] },
      command: { text: comment.body, issue_number: 1, author_permission: permission, human: true },
      loop: { pull_request: 2, issue_number: 1, state: expected.state, head: 'devloop/issue-1', trusted_author: true },
    },
    output_description: 'Return a JSON decision for the retry command, including close, budget, labels and next steps.',
  };
  if (arm === 'script') {
    const number = targetNumber(comment.body, target.issue);
    assert.equal(number, target.issue);
    const selected = selectLoopPR(prs, number, repository, context.repo.owner);
    assert.equal(selected.number, target.pr);
    fs.writeFileSync('evidence/result.json', JSON.stringify({
      target: 1, close_pr: 2, close_reason: 'stale PR closed by /retry (human sanction)', budget: 'gh-aw budget: reset',
      change_labels: false, next_steps: ['reapply_human_label', 'invoke_plan'],
    }));
  }
  fs.writeFileSync('evidence/fixture.json', JSON.stringify(result));
  fs.writeFileSync('evidence/input-readback.json', JSON.stringify({ target, author: comment.user.login, permission, currentSha: expected.head.sha }));
};
