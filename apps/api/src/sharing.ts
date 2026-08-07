// Runtime access registry. Production deployments should persist these records in Firestore.
export const mailboxShares=new Map<string,Set<string>>();
export function isMailboxShared(accountId:string,userId:string){return mailboxShares.get(accountId)?.has(userId)??false}
export function setMailboxShare(accountId:string,userId:string,allowed:boolean){
  const users=mailboxShares.get(accountId)??new Set<string>();
  allowed?users.add(userId):users.delete(userId);
  users.size?mailboxShares.set(accountId,users):mailboxShares.delete(accountId);
}
export function restoreMailboxShare(accountId:string,userId:string){setMailboxShare(accountId,userId,true)}
