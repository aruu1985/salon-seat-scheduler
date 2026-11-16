(function(){
  const DEFAULTS=[
    {id:'default-s-wash',name:'S洗',duration:1},
    {id:'default-k-cut',name:'K剪',duration:2},
    {id:'default-wash-cut',name:'洗剪',duration:3},
    {id:'default-color',name:'染',duration:6},
    {id:'default-root-color',name:'補染',duration:4},
    {id:'default-perm',name:'燙',duration:8},
    {id:'default-care',name:'護',duration:4},
    {id:'default-scalp',name:'頭皮',duration:3},
    {id:'default-style',name:'單造型',duration:2},
    {id:'default-nail',name:'美甲',duration:4}
  ];
  const CACHE_KEY='salon-service-catalog-v1';
  let collection=null,unsubscribe=null,current=DEFAULTS.map(item=>({...item}));

  function cachedCustom(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'[]')}catch(error){return []}
  }
  function merge(custom){
    const byName=new Map();
    [...DEFAULTS,...custom.filter(item=>item&&item.active!==false&&String(item.name||'').trim())].forEach(item=>byName.set(String(item.name).trim(),{...item,name:String(item.name).trim()}));
    current=Array.from(byName.values());
    return current.map(item=>({...item}));
  }
  function defaults(){return merge(cachedCustom())}
  function connect(db,onChange,onError){
    if(unsubscribe)unsubscribe();
    collection=db.collection('salons').doc('default').collection('services');
    unsubscribe=collection.onSnapshot(snapshot=>{
      const custom=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(custom))}catch(error){}
      onChange(merge(custom));
    },error=>{if(onError)onError(error);onChange(merge(cachedCustom()))});
  }
  async function add(name){
    const clean=String(name||'').trim().replace(/\s+/g,' ');
    if(!clean)throw new Error('請輸入消費項目名稱。');
    if(current.some(item=>item.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw new Error('這個消費項目已經存在。');
    if(!collection)throw new Error('Firebase 尚未連線，暫時無法新增選項。');
    const ref=collection.doc();
    await ref.set({name:clean,active:true,createdAtMs:Date.now()});
    return {id:ref.id,name:clean};
  }
  window.SalonCatalog={defaults,connect,add};
})();
