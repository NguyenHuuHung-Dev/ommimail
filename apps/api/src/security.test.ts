import { describe,it,expect } from 'vitest'; import crypto from 'node:crypto'; import { EncryptionService } from './security.js';
describe('EncryptionService',()=>{it('encrypts with random authenticated payloads',()=>{const s=new EncryptionService(crypto.randomBytes(32));const a=s.encrypt('secret');const b=s.encrypt('secret');expect(a).not.toBe(b);expect(s.decrypt(a)).toBe('secret')})});

