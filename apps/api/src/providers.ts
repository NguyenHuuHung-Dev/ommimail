import type { MailProviderAdapter, MailMessage } from '@omnimail/shared';
import { accounts, messages } from './demo-data.js';
export class DemoProviderAdapter implements MailProviderAdapter {
 constructor(private accountId:string){}
 async getProfile(){ const a=accounts.find(x=>x.id===this.accountId)!; return {emailAddress:a.emailAddress,displayName:a.displayName}; }
 async listFolders(){ return [{id:'inbox',name:'Inbox',unreadCount:8}]; }
 async listMessages(_c:unknown,o:Record<string,unknown>){ const items=messages.filter(m=>m.accountId===this.accountId).slice(0,Number(o.limit)||25); return {items,total:items.length}; }
 async getMessage(_c:unknown,id:string){ const m=messages.find(x=>x.id===id); if(!m) throw new Error('Message not found'); return m; }
 async updateMessage(_c:unknown,id:string,changes:Partial<MailMessage>){ const message=messages.find(x=>x.id===id); if(!message) throw new Error('Message not found'); Object.assign(message,changes); }
 async deleteMessage(_c:unknown,id:string){ const i=messages.findIndex(x=>x.id===id); if(i>=0) messages.splice(i,1); }
 async synchronize(){ return {added:0,updated:0,deleted:0,cursor:String(Date.now())}; }
}
export class GmailProviderAdapter extends DemoProviderAdapter {}
export class MicrosoftProviderAdapter extends DemoProviderAdapter {}
export class MockImapProviderAdapter extends DemoProviderAdapter {}
export class MockTempMailProviderAdapter extends DemoProviderAdapter {}
