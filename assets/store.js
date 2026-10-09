(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('node:crypto').webcrypto);
  else root.CampusStore=factory(root.CampusCore,root.crypto);
})(globalThis,function(C,cryptoProvider){
  'use strict';
  const POSTS_KEY='campus.posts.v1', OWNER_KEY='campus.owner.v1';
  function randomKey(){return Array.from(cryptoProvider.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
  function ownerKey(storage){
    try {
      const old=storage.getItem(OWNER_KEY);
      if(old && /^[0-9a-f]{64}$/.test(old))return old;
      if(old)throw new Error('invalid');
      const key=randomKey();storage.setItem(OWNER_KEY,key);return key;
    }catch(_){throw new Error('无法保存浏览器管理凭证，请允许本站使用本地存储后重试。');}
  }
  function seeds(now=new Date().toISOString()){
    const names=[['校园卡','校园卡','图书馆二楼','found','蓝色卡套，已交给图书馆服务台。请说明姓名和卡套特征。'],['黑色折叠伞','生活用品','第一教学楼','lost','晚自习后遗落在教室后排，伞柄有一小段白色胶带。'],['银色钥匙串','钥匙','第一食堂','found','两把钥匙和一枚绿色挂件，请描述其中一把钥匙的特征。'],['数据结构教材','书籍','图书馆一楼','lost','书中夹有手写笔记，封面右下角有姓名。'],['白色蓝牙耳机','数码','运动场','found','仅拾到充电盒，请说明型号及外壳特征。'],['蓝色保温杯','生活用品','宿舍区','lost','杯身有一张山峰贴纸，可能放在公共自习室。']];
    return names.map(([name,category,place,type,description],i)=>({id:`demo-${i}`,name,category,place,type,description,contact:'演示信息，请勿联系',ownerId:'example-only',status:'active',isExample:true,occurredAt:new Date(Date.parse(now)-(i+2)*3600000).toISOString(),createdAt:new Date(Date.parse(now)-(i+1)*1800000).toISOString()}));
  }
  class LocalStore{
    constructor(storage,owner,clock=()=>new Date().toISOString(),seed){this.storage=storage;this.owner=owner;this.clock=clock;this.seed=seed;}
    read(){
      let raw;
      try{raw=this.storage.getItem(POSTS_KEY);}catch(_){throw new Error('无法读取本地数据，请检查浏览器存储设置。');}
      if(raw===null){const initial=this.seed===undefined?seeds(this.clock()):this.seed;this.save(initial);return initial;}
      try{
        const list=JSON.parse(raw);
        if(!Array.isArray(list))throw new Error();
        for(const p of list){
          C.validate(p,this.clock());
          if(typeof p.id!=='string'||!p.id||typeof p.ownerId!=='string'||!['active','closed'].includes(p.status)||!Number.isFinite(Date.parse(p.createdAt)))throw new Error();
        }
        return list;
      }catch(_){throw new Error('本地记录已损坏，未覆盖原数据。请先备份浏览器存储或使用共享服务版。');}
    }
    save(list){try{this.storage.setItem(POSTS_KEY,JSON.stringify(list));}catch(_){throw new Error('保存失败，可能是存储空间不足或浏览器禁用了存储。');}}
    public(p){const {ownerId,...rest}=p;return {...rest,isMine:ownerId===this.owner};}
    async list(){return this.read().map(p=>this.public(p));}
    async create(input){
      const data=C.validate(input,this.clock());const list=this.read();
      const p={...data,id:randomKey(),ownerId:this.owner,status:'active',createdAt:this.clock(),isExample:false};
      this.save([...list,p]);return this.public(p);
    }
    async close(id){const list=this.read();const i=list.findIndex(p=>p.id===id);if(i<0)throw new Error('这条信息不存在');list[i]=C.close(list[i],this.owner);this.save(list);return this.public(list[i]);}
  }
  class HttpStore{
    constructor(owner,fetcher=globalThis.fetch.bind(globalThis)){this.owner=owner;this.fetcher=fetcher;}
    async request(path,method='GET',body){
      let res;try{res=await this.fetcher(path,{method,headers:{'X-Owner-Key':this.owner,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});}catch(_){throw new Error('连接服务失败，请确认服务仍在运行后重试。');}
      let data;try{data=await res.json();}catch(_){throw new Error('服务返回格式异常，请按 README 启动项目自带服务。');}
      if(!res.ok){const e=new Error(data.error||'操作失败，请重试');e.fields=data.fields||{};throw e;}return data;
    }
    list(){return this.request('/api/posts');}
    create(input){return this.request('/api/posts','POST',input);}
    close(id){return this.request(`/api/posts/${encodeURIComponent(id)}/close`,'POST',{});}
  }
  return {LocalStore,HttpStore,ownerKey,seeds};
});
