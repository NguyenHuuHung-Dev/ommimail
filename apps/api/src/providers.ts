import type { MailProviderAdapter, MailMessage, SendInput } from '@omnimail/shared';
import { accounts, messages } from './demo-data.js';
export class DemoProviderAdapter implements MailProviderAdapter {
 constructor(private accountId:string){}
 async getProfile(){ const a=accounts.find(x=>x.id===this.accountId)!; return {emailAddress:a.emailAddress,displayName:a.displayName}; }
 async listFolders(){ return [{id:'inbox',name:'Inbox',unreadCount:8},{id:'sent',name:'Sent',unreadCount:0},{id:'drafts',name:'Drafts',unreadCount:0},{id:'trash',name:'Trash',unreadCount:0}]; }
 async listMessages(_c:unknown,o:Record<string,unknown>){ const items=messages.filter(m=>m.accountId===this.accountId).slice(0,Number(o.limit)||25); return {items,total:items.length}; }
 async getMessage(_c:unknown,id:string){ const m=messages.find(x=>x.id===id); if(!m) throw new Error('Message not found'); return m; }
 async sendMessage(_c:unknown,input:SendInput){ const id=`msg-${Date.now()}`; messages.unshift({id,providerMessageId:id,accountId:input.accountId,folderIds:['sent'],labelIds:[],from:{address:accounts.find(a=>a.id===input.accountId)!.emailAddress},to:input.to,cc:input.cc??[],subject:input.subject,preview:input.text.slice(0,120),textBody:input.text,isRead:true,isStarred:false,isDraft:false,isSent:true,hasAttachments:false,receivedAt:new Date().toISOString()}); return {id}; }
 async updateMessage(_c:unknown,id:string,changes:Partial<MailMessage>){ const message=messages.find(x=>x.id===id); if(!message) throw new Error('Message not found'); Object.assign(message,changes); }
 async deleteMessage(_c:unknown,id:string){ const i=messages.findIndex(x=>x.id===id); if(i>=0) messages.splice(i,1); }
 async synchronize(){ return {added:0,updated:0,deleted:0,cursor:String(Date.now())}; }
}
export class GmailProviderAdapter extends DemoProviderAdapter {}
export class MicrosoftProviderAdapter extends DemoProviderAdapter {}
export class MockImapProviderAdapter extends DemoProviderAdapter {}
export class MockTempMailProviderAdapter extends DemoProviderAdapter {}
