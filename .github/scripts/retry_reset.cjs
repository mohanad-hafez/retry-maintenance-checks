const fs=require('node:fs');
function targetNumber(body,contextNumber){
 const m=/^\/retry(?:[ \t]+#?([1-9][0-9]*))?[ \t]*(?:\r?\n|$)/.exec(body||'');
 if(!m)throw Error('Unsupported retry command');
 const n=m[1]?Number(m[1]):contextNumber;
 if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid target');
 return n;
}
function selectLoopPR(prs,number,repository,owner){
 const candidates=prs.filter(p=>p.state==='open'&&p.head?.repo?.full_name===repository&&p.head.ref===`devloop/issue-${number}`);
 if(candidates.length>1)throw Error('Ambiguous loop PR');
 for(const p of candidates){
  if(p.user?.type!=='Bot'&&p.user?.login!==owner)throw Error('Untrusted loop PR author');
 }
 return candidates[0]||null;
}
async function reset({github,context,commentId,output='retry-result.json'}){
 const result={status:'reading',mutations:[],model_calls:0,comment_id:commentId};
 const save=()=>fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');save();
 const {owner,repo}=context.repo,repository=`${owner}/${repo}`;
 if(repository!=='mohanad-hafez/retry-maintenance-checks')throw Error('Owned experiment repository required');
 const comment=(await github.rest.issues.getComment({...context.repo,comment_id:commentId})).data;
 if(comment.user?.type!=='User')throw Error('Human command author required');
 const permission=(await github.rest.repos.getCollaboratorPermissionLevel({...context.repo,username:comment.user.login})).data.permission;
 if(!['admin','maintain','write'].includes(permission))throw Error('Author does not pass write-role gate');
 const contextMatch=new RegExp(`^https://api\\.github\\.com/repos/${repository}/issues/([1-9][0-9]*)$`).exec(comment.issue_url);
 if(!contextMatch)throw Error('Foreign command context');
 const target=targetNumber(comment.body,Number(contextMatch[1]));
 const issue=(await github.rest.issues.get({...context.repo,issue_number:target})).data;
 if(issue.pull_request)throw Error('PR command context is not enabled by original compiled issue-comment trigger');
 const marker=`<!-- retry-command:${commentId} -->`;
 const comments=await github.paginate(github.rest.issues.listComments,{...context.repo,issue_number:target,per_page:100});
 const previous=comments.filter(c=>c.user?.login==='github-actions[bot]'&&(c.body||'').includes(marker));
 if(previous.length){result.status='already_applied';result.target=target;save();return result;}
 const prs=await github.paginate(github.rest.pulls.list,{...context.repo,state:'open',per_page:100});
 const pr=selectLoopPR(prs,target,repository,owner);
 result.target=target;result.author=comment.user.login;result.permission=permission;result.issue_before=issue;result.command=comment;result.open_prs=prs;result.comments_before=comments;result.selected_pr=pr;save();
 async function mutate(operation,call){
  const entry={operation,status:'delivery_started'};result.mutations.push(entry);save();
  try{const response=await call();entry.status='delivered';entry.data=response.data;save();return response.data;}
  catch(e){entry.status='delivery_uncertain';result.status='delivery_uncertain';entry.error={name:e.name,message:e.message,status:e.status};save();throw e;}
 }
 if(pr){
  const current=(await github.rest.pulls.get({...context.repo,pull_number:pr.number})).data;
  if(current.state!=='open'||current.merged||current.head.sha!==pr.head.sha)throw Error('Loop PR changed before close');
  await mutate('close_stale_pr',()=>github.rest.pulls.update({...context.repo,pull_number:pr.number,state:'closed'}));
  await mutate('explain_stale_close',()=>github.rest.issues.createComment({...context.repo,issue_number:pr.number,body:'stale PR closed by /retry (human sanction)'}));
 }
 const body='gh-aw budget: reset\n\nAttempt budget reset. Re-apply the human trigger label or invoke `/plan` to restart the issue. Trigger labels were not changed.\n\n'+marker;
 const receipt=await mutate('stamp_budget_reset',()=>github.rest.issues.createComment({...context.repo,issue_number:target,body}));
 result.receipt=receipt;result.status='applied';save();return result;
}
module.exports={targetNumber,selectLoopPR,reset};
