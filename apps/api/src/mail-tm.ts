import crypto from 'node:crypto';
import type { MailMessage } from '@omnimail/shared';

const base='https://api.mail.tm';
type Domain={id:string;domain:string;isActive:boolean};
type Token={id:string;token:string};
type Account={id:string;address:string;createdAt:string};
type Summary={id:string;accountId:string;msgid:string;from:{name?:string;address:string};to:{name?:string;address:string}[];subject:string;intro:string;seen:boolean;hasAttachments:boolean;createdAt:string};
type Detail=Summary&{cc:string[];text?:string;html?:string[];attachments?:{id:string;filename:string;contentType:string;size:number}[]};
const credentials=new Map<string,{token:string;address:string;providerId:string}>();

async function request<T>(path:string,init?:RequestInit,token?:string):Promise<T>{
  const response=await fetch(`${base}${path}`,{...init,headers:{Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}});
  if(!response.ok) throw new Error(`mail.tm returned ${response.status}: ${(await response.text()).slice(0,200)}`);
  if(response.status===204) return undefined as T;
  return response.json() as Promise<T>;
}
function collection<T>(value:unknown):T[]{if(Array.isArray(value))return value as T[];if(value&&typeof value==='object'){const object=value as Record<string,unknown>;const list=object['hydra:member']??object.member;if(Array.isArray(list))return list as T[]}return []}
function dto(m:Summary,accountId:string):MailMessage{return {id:`mailtm:${accountId}:${m.id}`,accountId:`mailtm:${accountId}`,providerMessageId:m.id,providerThreadId:m.msgid,folderIds:['inbox'],labelIds:[],from:m.from,to:m.to,cc:[],subject:m.subject||'(No subject)',preview:m.intro??'',isRead:m.seen,isStarred:false,hasAttachments:m.hasAttachments,receivedAt:m.createdAt}}

export const mailTm={
  async domains(){return collection<Domain>(await request<unknown>('/domains')).filter(d=>d.isActive).map(d=>({id:d.id,name:d.domain,ready:true}))},
  async create(localPart:string,domain:string){const address=`${localPart}@${domain}`;const password=crypto.randomBytes(24).toString('base64url');const account=await request<Account>('/accounts',{method:'POST',body:JSON.stringify({address,password})});const auth=await request<Token>('/token',{method:'POST',body:JSON.stringify({address,password})});credentials.set(account.id,{token:auth.token,address,providerId:account.id});return account},
  async list(accountId:string){const auth=credentials.get(accountId);if(!auth)throw new Error('Temp mailbox session expired. Create a new address.');const raw=await request<unknown>('/messages',undefined,auth.token);return collection<Summary>(raw).map(m=>dto(m,accountId))},
  async get(accountId:string,messageId:string){const auth=credentials.get(accountId);if(!auth)throw new Error('Temp mailbox session expired. Create a new address.');const m=await request<Detail>(`/messages/${encodeURIComponent(messageId)}`,undefined,auth.token);return {...dto(m,accountId),cc:(m.cc??[]).map(address=>({address})),textBody:m.text,sanitizedHtmlBody:m.html?.join('\n'),attachments:(m.attachments??[]).map(a=>({id:a.id,filename:a.filename,mimeType:a.contentType,size:a.size}))}},
  credential(accountId:string){return credentials.get(accountId)},
  restore(accountId:string,credential:{token:string;address:string;providerId:string}){credentials.set(accountId,{...credential})},
  async remove(accountId:string){const auth=credentials.get(accountId);if(!auth)return;await request<void>(`/accounts/${encodeURIComponent(accountId)}`,{method:'DELETE'},auth.token);credentials.delete(accountId)}
};
