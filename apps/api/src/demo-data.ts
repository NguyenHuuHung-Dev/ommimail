import type { MailAccount, MailMessage } from '@omnimail/shared';
export const accounts: MailAccount[] = [
 {id:'gmail-1',provider:'gmail',emailAddress:'alex@omnimail.demo',displayName:'Alex Morgan',status:'connected',unreadCount:8,lastSyncedAt:new Date().toISOString(),color:'#ef4444'},
 {id:'outlook-1',provider:'microsoft',emailAddress:'alex.m@outlook.demo',displayName:'Alex Morgan',status:'connected',unreadCount:4,lastSyncedAt:new Date().toISOString(),color:'#2563eb'},
 {id:'temp-1',provider:'temp',emailAddress:'swift-owl@smtplabs.demo',displayName:'Temporary inbox',status:'connected',unreadCount:2,lastSyncedAt:new Date().toISOString(),color:'#8b5cf6'}
];
const people = [
 ['Maya Chen','maya@northstar.design'],['Linear','updates@linear.app'],['Jordan Bell','jordan@fable.co'],['GitHub','noreply@github.com'],['Sofia Rivera','sofia@studio.io'],['Vercel','ship@vercel.com'],['Marcus Lee','marcus@atlas.dev'],['Notion','team@makenotion.com']
];
const subjects = ['Q3 product review — notes & next steps','Your weekly project digest','Design handoff for the mobile experience','Security alert: new sign-in','Coffee next Thursday?','Deployment completed successfully','Updated contract and timeline','A calmer way to organize your work'];
export const messages: MailMessage[] = Array.from({length:32},(_,i)=>({
 id:`msg-${i+1}`,accountId:accounts[i%3].id,providerMessageId:`provider-${i+1}`,providerThreadId:`thread-${Math.floor(i/2)}`,
 folderIds:[i===7?'sent':'inbox'],labelIds:i%5===0?['Important']:i%7===0?['Finance']:[],from:{name:people[i%people.length][0],address:people[i%people.length][1]},to:[{name:'Alex Morgan',address:accounts[i%3].emailAddress}],cc:[],subject:subjects[i%subjects.length],
 preview:['Sharing the final notes from our conversation. I highlighted the decisions that need your attention.','Here is a concise summary of everything that changed this week, plus a look ahead.','The files are ready for review. Let me know if anything needs another pass.'][i%3],
 textBody:`Hi Alex,\n\n${['Sharing the final notes from our conversation. I highlighted the decisions that need your attention.','Here is a concise summary of everything that changed this week, plus a look ahead.','The files are ready for review. Let me know if anything needs another pass.'][i%3]}\n\nThe team made excellent progress and the remaining work is clearly scoped. Please take a look when you have a moment.\n\nBest,\n${people[i%people.length][0]}`,
 isRead:i>11||i%4===0,isStarred:i%6===0,isDraft:i===8,isSent:i===7,hasAttachments:i%5===0,attachments:i%5===0?[{id:`att-${i}`,filename:'Project brief.pdf',mimeType:'application/pdf',size:2480000}]:[],receivedAt:new Date(Date.now()-i*36e5*5).toISOString()
}));

