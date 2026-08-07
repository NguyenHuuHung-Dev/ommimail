import {describe,expect,it} from 'vitest';
function tokens(query:string){return query.trim().split(/\s+/).filter(Boolean)}
describe('search syntax',()=>{it('keeps provider and unread operators',()=>{expect(tokens('provider:gmail is:unread project')).toEqual(['provider:gmail','is:unread','project'])})});
