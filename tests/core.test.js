const {test}=require('node:test');
const assert=require('node:assert/strict');
let C={};try{C=require('../assets/core.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const now='2026-10-09T12:00:00Z';
const valid=()=>({type:'lost',name:' 校园卡 ',category:'校园卡',place:' 图书馆 ',occurredAt:'2026-10-08T08:00:00Z',contact:' 测试微信 ',description:' 蓝色卡套 '});
test('trim valid fields without losing description',()=>{const p=C.validate(valid(),now);assert.equal(p.name,'校园卡');assert.equal(p.place,'图书馆');assert.equal(p.description,'蓝色卡套');});
for(const field of ['name','place','contact'])test(`reject whitespace ${field}`,()=>{assert.throws(()=>C.validate({...valid(),[field]:'　 \t '},now),e=>!!e.fields[field]);});
for(const [field,n] of [['name',40],['place',60],['contact',100],['description',500]])test(`enforce ${field} Unicode length boundary`,()=>{assert.equal([...C.validate({...valid(),[field]:'🌱'.repeat(n)},now)[field]].length,n);assert.throws(()=>C.validate({...valid(),[field]:'🌱'.repeat(n+1)},now),e=>!!e.fields[field]);});
test('reject future and invalid date',()=>{for(const time of ['2030-01-01T00:00:00Z','bad','2026-02-30T08:00:00Z'])assert.throws(()=>C.validate({...valid(),occurredAt:time},now),e=>!!e.fields.occurredAt);});
test('reject unknown type or category',()=>{for(const value of [{type:'hack'},{category:'未知'}])assert.throws(()=>C.validate({...valid(),...value},now));});
const posts=[{id:'a',name:'校园卡',type:'found',category:'校园卡',place:'图书馆',status:'active',createdAt:'2026-10-01T01:00:00Z'}, {id:'b',name:'蓝色水杯',type:'lost',category:'生活用品',place:'食堂',status:'active',createdAt:'2026-10-02T01:00:00Z'}, {id:'c',name:'CAMPUS校园卡',type:'lost',category:'校园卡',place:'图书馆',status:'closed',createdAt:'2026-10-03T01:00:00Z'}];
test('search trim, case and no result',()=>{assert.deepEqual(C.query(posts,{keyword:' 校园 '} ).map(x=>x.id),['a']);assert.deepEqual(C.query(posts,{keyword:'campus',includeClosed:true}).map(x=>x.id),['c']);assert.equal(C.query(posts,{keyword:'耳机'}).length,0);});
test('explicit search rejects all whitespace',()=>{assert.throws(()=>C.query(posts,{keyword:'　 ',search:true}));});
test('combine type, category and place without changing input',()=>{assert.deepEqual(C.query(posts,{category:'校园卡',place:'图书馆',type:'found'}).map(x=>x.id),['a']);assert.equal(posts[0].id,'a');});
test('sort descending and optionally retain ended posts',()=>{assert.deepEqual(C.query(posts,{}).map(x=>x.id),['b','a']);assert.deepEqual(C.query(posts,{includeClosed:true}).map(x=>x.id),['c','b','a']);});
test('only owner can close, preserving original record',()=>{const p={...posts[0],ownerId:'owner'};assert.throws(()=>C.close(p,'other'));const out=C.close(p,'owner');assert.equal(out.status,'closed');assert.equal(p.status,'active');assert.throws(()=>C.close(out,'owner'));});
