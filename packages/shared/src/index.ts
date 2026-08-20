export type Provider = 'gmail' | 'microsoft' | 'imap' | 'temp';
export type AccountStatus = 'connected' | 'syncing' | 'expired' | 'error' | 'disconnected';
export interface MailAddress { name?: string; address: string }
export interface MailAccount { id:string; provider:Provider; emailAddress:string; displayName?:string; status:AccountStatus; unreadCount:number; connectedAt?:string; lastSyncedAt?:string; color?:string; access?:'owner'|'shared' }
export interface Attachment { id:string; filename:string; mimeType:string; size:number }
export interface MailMessage { id:string; accountId:string; providerMessageId:string; providerThreadId?:string; folderIds:string[]; labelIds:string[]; from:MailAddress; to:MailAddress[]; cc:MailAddress[]; subject:string; preview:string; textBody?:string; sanitizedHtmlBody?:string; isRead:boolean; isStarred:boolean; hasAttachments:boolean; attachments?:Attachment[]; receivedAt:string }
export interface MessageShare {
  id:string;
  message:MailMessage;
  mailbox:{ emailAddress:string; provider:Provider };
  owner:{ userId:string; email:string; displayName?:string };
  recipient:{ userId:string; email:string; displayName?:string };
  sharedAt:string;
}
export interface PaginatedMessages { items:MailMessage[]; nextCursor?:string; total:number }
export type MailSyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface MailSyncJob { id:string; accountId:string; status:MailSyncJobStatus; requestedAt:string; startedAt?:string; completedAt?:string; messageCount?:number; unreadCount?:number; error?:string }
export interface ApiError { success:false; error:{ code:string; message:string; details?:Record<string, unknown> } }
export interface TempAddress { id:string; address:string; expiresAt:string }
export interface MailFolder { id:string; name:string; type?:string; unreadCount:number }
export interface SyncResult { added:number; updated:number; deleted:number; cursor?:string }
export interface MailProviderAdapter {
  getProfile(credentials:unknown):Promise<Pick<MailAccount,'emailAddress'|'displayName'>>;
  listFolders(credentials:unknown):Promise<MailFolder[]>;
  listMessages(credentials:unknown, options:Record<string,unknown>):Promise<PaginatedMessages>;
  getMessage(credentials:unknown,messageId:string):Promise<MailMessage>;
  updateMessage(credentials:unknown,messageId:string,changes:Partial<MailMessage>):Promise<void>;
  deleteMessage(credentials:unknown,messageId:string):Promise<void>;
  synchronize(credentials:unknown,cursor?:string):Promise<SyncResult>;
}
