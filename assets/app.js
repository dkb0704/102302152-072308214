(function () {
  'use strict';
  const C=CampusCore, S=CampusStore, main=document.querySelector('main');
  const state={items:[],type:'',category:'',place:'',includeClosed:false,request:0};
  const local=location.protocol==='file:';
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();main.focus();});
  let store, pendingId=null, toastTimer;
  const paths={
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    '校园卡':'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16c.5-3 4.5-3 5 0M14 10h4M14 14h4"/>',
    '钥匙':'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m0 6 3-3"/>',
    '数码':'<path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6Zm16 0h1v6h-4v-6Z"/>',
    '生活用品':'<path d="M7 7h10l-1 14H8ZM8 3h8M9 3v4m6-4v4M10 11h4"/>',
    '书籍':'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
    '其他':'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M8 7V5a4 4 0 0 1 8 0v2M9 12h6"/>'
  };
  function el(tag, cls, text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function icon(name){const span=el('span');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths['其他']}</svg>`;return span.firstElementChild;}
  function link(text,hash,cls='button'){const a=el('a',cls,text);a.href=hash;return a;}
  function button(text,handler,cls='button'){const b=el('button',cls,text);b.type='button';b.addEventListener('click',handler);return b;}
  function append(parent,...children){children.forEach(n=>{if(n)parent.append(n);});return parent;}
  function date(value){return new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
  function toast(text){const n=document.querySelector('#toast');clearTimeout(toastTimer);n.textContent=text;n.hidden=false;toastTimer=setTimeout(()=>{n.hidden=true;},4200);}
  function modeText(){return local?'本地演示 · 数据仅保存在当前浏览器':'共享服务 · 同一服务中的信息可共同查看';}
  function badge(p){return el('span',`badge ${p.status==='closed'?'closed':p.type==='lost'?'lost':''}`,C.statusText(p));}
  function itemIcon(p){return append(el('div',`item-icon ${p.category==='生活用品'?'warm':p.category==='钥匙'?'green':''}`),icon(p.category));}
  function heading(title,desc){return append(el('div','page-heading'),el('h1','',title),el('p','',desc));}
  function empty(title,description,actions=[]){return append(el('div','empty'),el('div','empty-icon','⌕'),el('h2','',title),el('p','',description),...actions);}
  function guide(){return append(el('aside','guide-bar'),el('span','','♡'),append(el('div'),el('strong','','归还前，多核对一个细节'),el('p','','通过联系方式约定交接，核对物品特征。找回或归还后，记得在“我的发布”结束信息。')));}
  function route(){const raw=location.hash.slice(1)||'home';const [path,query]=raw.split('?');return {path,params:new URLSearchParams(query||'')};}
  function go(hash){if(location.hash===hash)render();else location.hash=hash;}
  function nav(path){document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===(path==='search'?'home':path);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function searchForm(keyword=''){
    const f=el('form','search-box');f.setAttribute('role','search');
    const input=el('input');input.type='search';input.name='keyword';input.placeholder='搜索物品名称，比如：校园卡、钥匙';input.setAttribute('aria-label','搜索物品名称');input.value=keyword;
    const submit=el('button','button','搜索');submit.type='submit';
    f.addEventListener('submit',e=>{e.preventDefault();const value=input.value.trim();if(!value){toast('请输入物品名称后搜索');input.focus();return;}state.type='';go('#search?q='+encodeURIComponent(value));});
    return append(f,icon('search'),input,submit);
  }
  function card(p){
    const a=link('', '#detail/'+p.id,'item-card');a.setAttribute('aria-label',p.name+'，'+C.statusText(p)+'，查看详情');
    append(a,append(el('div','card-top'),itemIcon(p),badge(p)),el('h3','',p.name),append(el('p','card-location'),icon('pin'),el('span','',p.place)),el('p','card-description',p.description||'发布者暂未补充物品特征，可在详情中查看联系方式。'),append(el('div','card-bottom'),el('span','',(p.isExample?'示例 · ':p.isMine?'我发布的 · ':'')+date(p.createdAt)),el('span','arrow','↗')));
    return a;
  }
  function filters(onChange,mine){
    const box=el('div','filters');const tabs=el('div','tabs');tabs.setAttribute('aria-label','信息类型');
    for(const [value,label]of[['','全部信息'],['found','招领信息'],['lost','寻物信息']]){const b=button(label,()=>{state.type=value;onChange();},state.type===value?'selected':'');b.setAttribute('aria-pressed',String(state.type===value));tabs.append(b);}
    box.append(tabs);
    for(const [key,label,options]of[['category','所有类别',C.categories],['place','所有地点',[...new Set(state.items.map(p=>p.place))].sort()]]){
      const s=el('select');s.setAttribute('aria-label',key==='category'?'筛选物品类别':'筛选地点');s.append(new Option(label,''));options.forEach(value=>s.append(new Option(value,value)));s.value=state[key];s.addEventListener('change',()=>{state[key]=s.value;onChange();});box.append(s);
    }
    if(!mine){const check=el('input');check.type='checkbox';check.checked=state.includeClosed;check.addEventListener('change',()=>{state.includeClosed=check.checked;onChange();});box.append(append(el('label','checkbox'),check,el('span','','包含已结束')));}
    if(state.category||state.place||state.type||state.includeClosed)box.append(button('清空筛选',()=>{Object.assign(state,{type:'',category:'',place:'',includeClosed:false});onChange();},'button quiet'));
    return box;
  }
  function listing(path,params){
    const mine=path==='mine',search=path==='search',keyword=params.get('q')||'';
    if(path==='home'){
      const hero=el('section','hero');
      append(hero,el('div','hero-decoration','↗'),el('div','eyebrow','LOST & FOUND / 校园互助'),el('h1','','让遗失的物品，重新回到身边。'),el('p','','少一点焦急，多一份回应。在这里发布、寻找，把偶然的拾获变成温暖的归还。'),append(el('div','mode'),el('span','mode-dot'),el('span','',modeText())));main.append(hero);
    }else main.append(heading(mine?'我的发布':'搜索物品',mine?'查看本浏览器发布的信息，找回或归还后及时更新状态。':'按名称寻找线索，也可以结合类别和地点缩小范围。'));
    if(!mine)main.append(searchForm(keyword));
    if(mine)main.append(el('p','alert','管理权限保存在当前浏览器；清除浏览器数据或换浏览器后，将无法管理之前发布的信息。'));
    main.append(filters(()=>draw(),mine));
    let items;
    try{items=C.query(state.items,{...state,keyword,search,mine,includeClosed:mine||state.includeClosed});}
    catch(e){main.append(empty('请输入物品名称',e.message,[link('返回信息广场','#home','button secondary')]));return;}
    const title=mine?'我发布的信息':search?`“${keyword}”的搜索结果`:'最新信息';
    const h=el('h2','',title);h.append(el('span','count',`${items.length} 条`));
    main.append(append(el('div','section-heading'),h,button('↻ 刷新',()=>render(),'button quiet')));
    if(items.length){const grid=el('div','cards');items.forEach(p=>grid.append(card(p)));main.append(grid);}
    else main.append(empty(mine?'还没有发布过信息':search?'没有找到相关物品':'这里暂时没有信息',mine?'发布一条寻物或招领信息，从这里跟进进展。':'试试其他关键词或筛选条件，也可以发布一条信息。',[link('发布信息','#publish'),link('返回信息广场','#home','button secondary')]));
    if(search)main.append(link('← 返回信息广场','#home','back'));
    main.append(guide());
  }
  function field(key,label,tag='input',type='text',placeholder='',required=true){
    const wrapper=el('div','field'),l=el('label','',label),input=el(tag);l.htmlFor='field-'+key;
    if(required)l.append(el('span','required','*'));input.id='field-'+key;input.name=key;
    if(tag==='input')input.type=type;if(placeholder)input.placeholder=placeholder;
    input.required=required;input.setAttribute('aria-describedby','error-'+key);
    const error=el('small','error');error.id='error-'+key;
    return {wrapper:append(wrapper,l,input,error),input,label:l};
  }
  function publish(){
    main.append(heading('发布一条信息','写下物品与线索，让寻找和归还更容易。'));
    const layout=el('div','form-layout'),form=el('form','panel');form.noValidate=true;
    const picker=el('div','type-picker');
    for(const [value,title,desc]of[['lost','我在寻找','丢了东西，寻找线索'],['found','我捡到了','寻找失主，等待认领']]){
      const label=el('label','type-choice'),radio=el('input');radio.type='radio';radio.name='type';radio.value=value;radio.checked=value==='lost';append(label,radio,append(el('span'),el('strong','',title),el('small','',desc)));picker.append(label);
    }
    form.append(picker);
    const name=field('name','物品名称','input','text','例如：蓝色保温杯（最多40字）');
    const category=field('category','物品类别','select');category.input.append(new Option('请选择类别',''));C.categories.forEach(c=>category.input.append(new Option(c,c)));
    const place=field('place','丢失地点','input','text','例如：图书馆二楼（最多60字）');
    const time=field('occurredAt','丢失时间','input','datetime-local');
    const now=new Date();const localTime=new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,16);time.input.max=localTime;time.input.value=localTime;
    const contact=field('contact','联系方式','input','text','填写微信、电话或交还地点（最多100字）');
    const desc=field('description','物品描述','textarea','text','补充颜色、特征等线索；请保留部分细节用于线下核对（最多500字）',false);
    append(form,append(el('div','form-row'),name.wrapper,category.wrapper),append(el('div','form-row'),place.wrapper,time.wrapper),desc.wrapper,contact.wrapper);
    const footer=el('div','form-footer'),errors=el('p','error');errors.setAttribute('role','alert');
    const submit=el('button','button','确认发布');submit.type='submit';append(footer,el('p','muted small-text','联系方式将随信息公开展示。发布权限保存在本浏览器，清除数据后无法恢复。'),errors,submit);form.append(footer);
    picker.addEventListener('change',()=>{const found=form.elements.type.value==='found';place.label.firstChild.textContent=found?'拾取地点':'丢失地点';time.label.firstChild.textContent=found?'拾取时间':'丢失时间';});
    let submitting=false;
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(submitting)return;submitting=true;submit.disabled=true;submit.textContent='正在发布…';errors.textContent='';
      form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));form.querySelectorAll('small.error').forEach(n=>{n.textContent='';});
      try{
        const data=Object.fromEntries(new FormData(form));const parsed=new Date(data.occurredAt);data.occurredAt=Number.isNaN(parsed.getTime())?'':parsed.toISOString();
        const clean=C.validate(data);const post=await store.create(clean);go('#success/'+post.id);
      }catch(err){errors.textContent=err.message;const fields=err.fields||{};for(const [key,msg]of Object.entries(fields)){const n=form.querySelector('[name="'+key+'"]');const label=form.querySelector('#error-'+key);if(n)n.setAttribute('aria-invalid','true');if(label)label.textContent=msg;}const invalid=form.querySelector('[aria-invalid="true"]');if(invalid)invalid.focus();}
      finally{submitting=false;submit.disabled=false;submit.textContent='确认发布';}
    });
    const note=append(el('aside','note-panel'),el('h3','','发布小提示'),append(el('p'),el('strong','','01  写清楚发生地点'),document.createTextNode('尽量写到教学楼、楼层或附近明显位置，方便双方判断。')),append(el('p'),el('strong','','02  留下可用联系方式'),document.createTextNode('不要填写校园卡号等不必要的个人信息。捡到校园卡可交给服务台。')),append(el('p'),el('strong','','03  结束后及时更新'),document.createTextNode('归还或找回后，在“我的发布”标记完成，减少重复询问。')),el('p','',modeText()));
    append(layout,form,note);main.append(layout);
  }
  function detail(id){
    const p=state.items.find(x=>x.id===id);main.append(link('← 返回信息广场','#home','back'));
    if(!p){main.append(empty('信息不存在','记录可能已不可用，请返回列表刷新。',[link('返回信息广场','#home')]));return;}
    const layout=el('div','detail-layout'),info=el('article','panel');
    append(info,append(el('div','detail-title'),itemIcon(p),append(el('div'),badge(p),el('h1','',p.name),el('p','muted small-text',p.isExample?'示例信息 · 用于演示操作':`发布于 ${date(p.createdAt)}`))));
    const dl=el('dl','detail-meta');for(const [label,value]of[['信息类型',p.type==='lost'?'寻物信息':'招领信息'],['物品类别',p.category],[p.type==='lost'?'丢失地点':'拾取地点',p.place],[p.type==='lost'?'丢失时间':'拾取时间',date(p.occurredAt)]])dl.append(append(el('div'),el('dt','',label),el('dd','',value)));
    append(info,dl,el('h3','','物品描述'),el('p','detail-description',p.description||'发布者暂未填写描述。'));
    const side=el('aside','panel contact-panel');append(side,el('h2','','联系发布者'),el('p','muted small-text',p.status==='closed'?'这条信息已结束，请避免重复联系。':'先核对物品特征，再约定交接时间和地点。'),el('div','contact-value',p.contact));
    const copy=button('复制联系方式',async()=>{try{if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(p.contact);toast('联系方式已复制');}catch(_){const node=side.querySelector('.contact-value');const range=document.createRange();range.selectNodeContents(node);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);toast('未能自动复制，已选中文本，请手动复制');}},'button secondary');side.append(copy);
    if(p.isMine){const actions=el('div','owner-actions');actions.append(el('p','','这是你发布的信息，可在完成交接后结束。'));if(p.status==='active')actions.append(button(p.type==='lost'?'标记已找回':'标记已归还',()=>confirmClose(p)));else actions.append(el('p','',`✓ ${C.statusText(p)}，记录已保留。`));side.append(actions);}
    else side.append(el('p','muted small-text','状态由发布者更新。'));
    append(layout,info,side);main.append(layout,guide());
  }
  function success(id){main.append(append(el('section','panel success'),el('div','success-icon','✓'),el('h1','','发布成功'),el('p','','信息已经保存。希望这条线索，能让物品早一点回家。'),link('查看这条信息','#detail/'+id),link('查看我的发布','#mine','button secondary'),el('p','small-text',modeText())));}
  function confirmClose(p){pendingId=p.id;const dialog=document.querySelector('#confirm-dialog');document.querySelector('#dialog-copy').textContent=`将“${p.name}”标记为${p.type==='lost'?'已找回':'已归还'}，确认已完成交接吗？`;document.querySelector('#dialog-error').textContent='';const b=document.querySelector('#confirm-close');b.textContent=p.type==='lost'?'确认已找回':'确认已归还';b.disabled=false;dialog.showModal();}
  document.querySelector('#confirm-close').addEventListener('click',async function(){if(!pendingId||this.disabled)return;this.disabled=true;try{await store.close(pendingId);document.querySelector('#confirm-dialog').close();toast('状态已更新，信息已结束');await render();}catch(e){document.querySelector('#dialog-error').textContent=e.message;}finally{this.disabled=false;}});
  document.querySelector('#confirm-dialog').addEventListener('close',()=>{pendingId=null;});
  function draw(){
    const {path,params}=route();main.replaceChildren();nav(path);
    if(['home','search','mine'].includes(path))listing(path,params);
    else if(path==='publish')publish();
    else if(path.startsWith('detail/'))detail(path.slice(7));
    else if(path.startsWith('success/'))success(path.slice(8));
    else main.append(empty('没有这个页面','返回信息广场继续寻找。',[link('返回信息广场','#home')]));
  }
  async function render(){
    const current=++state.request;
    try{const items=await store.list();if(current!==state.request)return;state.items=items;draw();}
    catch(e){if(current!==state.request)return;main.replaceChildren(empty('暂时无法读取信息',e.message,[button('重试',()=>start())]));}
  }
  function start(){try{store=local?new S.LocalStore(localStorage,S.ownerKey(localStorage)):new S.HttpStore(S.ownerKey(localStorage));render();}catch(e){main.replaceChildren(empty('浏览器存储不可用',e.message,[button('重试',()=>start())]));}}
  window.addEventListener('hashchange',()=>{const dialog=document.querySelector('#confirm-dialog');if(dialog.open)dialog.close();render();window.scrollTo(0,0);});
  start();
})();
