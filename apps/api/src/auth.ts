import type { NextFunction,Request,Response } from 'express';
import { applicationDefault,cert,getApps,initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { saveUserProfile } from './firestore-store.js';

export type UserRole='admin'|'premium'|'basic';
export type AuthRequest=Request&{userId:string;role:UserRole;email?:string};
export const userDirectory=new Map<string,{email:string;lastSeenAt:string;role:UserRole}>();
export const roleOverrides=new Map<string,Exclude<UserRole,'admin'>>();
const inlineServiceAccountConfigured=Boolean(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_CLIENT_EMAIL&&process.env.FIREBASE_PRIVATE_KEY);
export const serviceAccountConfigured=inlineServiceAccountConfigured||Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
export const authConfigured=Boolean(process.env.FIREBASE_PROJECT_ID);
if(authConfigured&&!getApps().length){
  if(inlineServiceAccountConfigured)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID!,clientEmail:process.env.FIREBASE_CLIENT_EMAIL!,privateKey:process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g,'\n')})});
  else if(process.env.GOOGLE_APPLICATION_CREDENTIALS)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  else initializeApp({projectId:process.env.FIREBASE_PROJECT_ID});
}
// The allowlist is intentionally server-side; removing an email takes effect after an API restart.
function allowedAdmins(){return new Set((process.env.ADMIN_EMAILS??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
export async function authenticate(req:Request,res:Response,next:NextFunction){
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(authConfigured){
    if(!token)return res.status(401).json({success:false,error:{code:'UNAUTHENTICATED',message:'Sign in required',details:{}}});
    try{const decoded=await getAuth().verifyIdToken(token);const email=decoded.email?.toLowerCase();const target=req as AuthRequest;target.userId=decoded.uid;target.email=email;target.role=decoded.admin===true||(email?allowedAdmins().has(email):false)?'admin':roleOverrides.get(decoded.uid)??(decoded.role==='premium'?'premium':'basic');if(email){const profile={email,lastSeenAt:new Date().toISOString(),role:target.role};userDirectory.set(decoded.uid,profile);void saveUserProfile({userId:decoded.uid,...profile}).catch(()=>undefined)}return next()}catch{return res.status(401).json({success:false,error:{code:'INVALID_TOKEN',message:'Session is invalid or expired',details:{}}})}
  }
  const target=req as AuthRequest;target.userId='local-user';target.role='admin';target.email='admin@local.test';userDirectory.set(target.userId,{email:target.email,lastSeenAt:new Date().toISOString(),role:target.role});return next();
}
export function requireAdmin(req:Request,res:Response,next:NextFunction){if((req as AuthRequest).role!=='admin')return res.status(403).json({success:false,error:{code:'ADMIN_REQUIRED',message:'Administrator permission is required',details:{}}});return next()}
