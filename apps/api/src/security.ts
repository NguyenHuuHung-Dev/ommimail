import crypto from 'node:crypto';
export class EncryptionService {
 constructor(private readonly key:Buffer, private readonly keyVersion=1){ if(key.length!==32) throw new Error('Encryption key must be 32 bytes'); }
 encrypt(value:string){ const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv); const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); return JSON.stringify({v:this.keyVersion,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}); }
 decrypt(payload:string){ const p=JSON.parse(payload) as {iv:string;tag:string;data:string}; const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(p.iv,'base64')); decipher.setAuthTag(Buffer.from(p.tag,'base64')); return Buffer.concat([decipher.update(Buffer.from(p.data,'base64')),decipher.final()]).toString('utf8'); }
}

