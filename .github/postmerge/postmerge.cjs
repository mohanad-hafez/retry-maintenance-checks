const fs=require('node:fs');
function specRefs(body){
 const text=(body||'').replace(/```[\s\S]*?```/g,'');
 const values=new Set();
 for(const m of text.matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#([1-9][0-9]*)\b/gi))values.add(Number(m[1]));
 for(const m of text.matchAll(/^Spec issue:\s*#([1-9][0-9]*)\s*$/gm))values.add(Number(m[1]));
 return [...values].sort((a,b)=>a-b);
}
async function closeout({github,context,mergeSha,mergeShas,expectedBase}){
 const commits=[...new Set(mergeShas||[mergeSha])];if(!commits.length||commits.some(x=>!/^[a-f0-9]{40}$/.test(x)))throw Error('Invalid pushed commit list');
 const receipt={status:'reading',merge_shas:commits,mutations:[],model_calls:0};const save=()=>fs.writeFileSync('postmerge-result.json',JSON.stringify(receipt,null,2)+'\n');save();
 if(context.repo.owner!=='mohanad-hafez'||context.repo.repo!=='retry-maintenance-checks')throw Error('Owned fork required');
 const selected=new Map();receipt.prs=[];
 for(const sha of commits){
  const prs=await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,{...context.repo,commit_sha:sha,per_page:100});
  const landed=prs.filter(p=>p.merge_commit_sha===sha&&p.base.ref===expectedBase);if(landed.length>1)throw Error('Ambiguous landed PR');if(!landed.length)continue;
  const pr=(await github.rest.pulls.get({...context.repo,pull_number:landed[0].number})).data;
  if(!pr.merged||pr.merge_commit_sha!==sha||pr.base.repo.full_name!==context.repo.owner+'/'+context.repo.repo)throw Error('Unverified merge');
  const permission=(await github.rest.repos.getCollaboratorPermissionLevel({...context.repo,username:pr.merged_by.login})).data.permission;if(!['admin','maintain','write'].includes(permission))throw Error('Merge actor lacks trusted role');
  receipt.prs.push(pr);for(const number of specRefs(pr.body)){if(selected.has(number)&&selected.get(number).pr.number!==pr.number)throw Error('Multiple merged PRs for same issue require inspection');selected.set(number,{pr,sha});}
 }
 if(selected.size>6)throw Error('Closeout cap exceeded');receipt.targets=[];save();
 const plans=[];
 for(const [number,{pr,sha}]of selected){const issue=(await github.rest.issues.get({...context.repo,issue_number:number})).data;if(issue.pull_request)throw Error('Spec reference points at PR');const comments=await github.paginate(github.rest.issues.listComments,{...context.repo,issue_number:number,per_page:100});const marker=`<!-- post-merge:${sha}:${number} -->`;plans.push({number,pr_number:pr.number,issue,marker,already_recorded:comments.some(c=>c.user.login==='github-actions[bot]'&&(c.body||'').includes(marker))});}
 receipt.targets=plans;save();
 async function mutate(operation,number,call){const entry={operation,issue:number,status:'delivery_started'};receipt.mutations.push(entry);save();try{entry.data=(await call()).data;entry.status='delivered';save();}catch(e){entry.status='delivery_uncertain';entry.error={message:e.message,status:e.status};receipt.status='delivery_uncertain';save();throw e;}}
 for(const p of plans){
  if(p.already_recorded)continue;
  const now=(await github.rest.issues.get({...context.repo,issue_number:p.number})).data;
  if(now.state==='open')await mutate('close_issue',p.number,()=>github.rest.issues.update({...context.repo,issue_number:p.number,state:'closed',state_reason:'completed'}));
  await mutate('record_merge',p.number,()=>github.rest.issues.createComment({...context.repo,issue_number:p.number,body:`PR #${p.pr_number} merged → #${p.number} recorded\n\n${p.marker}`}));
 }
 receipt.status=receipt.mutations.length?'applied':'noop';save();return receipt;
}
module.exports={specRefs,closeout};
