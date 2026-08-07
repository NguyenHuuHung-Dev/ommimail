import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from 'firebase-admin/auth';
import { serviceAccountConfigured } from '../auth.js';

const email=process.argv[2]?.trim().toLowerCase();
if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('Usage: pnpm --filter @omnimail/api admin:grant user@example.com');
if(serviceAccountConfigured){
  const user=await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
  console.log(`Firebase admin claim granted to ${email}. Sign out and sign in again.`);
}else{
  const envPath=path.resolve(process.cwd(),'.env');
  const source=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
  const match=source.match(/^ADMIN_EMAILS=(.*)$/m);
  const values=new Set((match?.[1]??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));values.add(email);
  const line=`ADMIN_EMAILS=${[...values].join(',')}`;
  const next=match?source.replace(/^ADMIN_EMAILS=.*$/m,line):`${source.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath,next);
  console.log(`Local admin allowlist updated for ${email}. Restart the API, then sign out and sign in again.`);
}
