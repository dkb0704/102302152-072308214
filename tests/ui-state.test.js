const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Exercise the actual async renderer with controlled IO responses, not a copy of its algorithm.
const source=fs.readFileSync(require.resolve('../assets/app.js'),'utf8');
const renderer=source.slice(source.indexOf('async function render(){'),source.indexOf('\n  function start(){'));
test('a delayed old response cannot overwrite a newer closed state',async()=>{
  const replies=[];const views=[];const state={request:0,items:[]};
  const context={state,store:{list:()=>new Promise(resolve=>replies.push(resolve))},draw:()=>views.push(state.items[0].status)};
  vm.createContext(context);vm.runInContext(renderer,context);
  const old=context.render();const current=context.render();
  replies[1]([{status:'closed'}]);await current;
  replies[0]([{status:'active'}]);await old;
  assert.equal(state.items[0].status,'closed');assert.deepEqual(views,['closed']);
});
