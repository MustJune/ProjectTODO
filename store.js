/*
 * store.js — 저장소 모듈
 *  1) Store.kv     : 브라우저 IndexedDB 키-값 저장 (작업 폴더 핸들, 복구용 마지막 상태)
 *  2) Store.folder : 작업 폴더 접근 (File System Access API)
 *       - pick()        폴더 선택 창
 *       - permission()  읽기·쓰기 권한 확인/요청
 *       - list()        "업무일정_YYYY_Wnn.xlsx" 파일 목록 (nn = 주차 번호)
 *       - read()/write()
 * 데이터 원본은 작업 폴더의 엑셀 파일이며, IndexedDB는 폴더 기억과 비상 복구용으로만 사용한다.
 */
'use strict';
window.Store=(()=>{
  const DB='work-schedule', OS='kv';
  let dbp=null;
  const db=()=>dbp||(dbp=new Promise((res,rej)=>{
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>r.result.createObjectStore(OS);
    r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
  }));
  const tx=async(mode,fn)=>{const d=await db();return new Promise((res,rej)=>{
    const t=d.transaction(OS,mode),q=fn(t.objectStore(OS));
    t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})};
  const kv={
    get:k=>tx('readonly',s=>s.get(k)).catch(()=>undefined),
    set:(k,v)=>tx('readwrite',s=>s.put(v,k)).catch(()=>undefined),
    del:k=>tx('readwrite',s=>s.delete(k)).catch(()=>undefined)
  };

  const FILE_RE=/^업무일정_(\d{4})_W(\d{2})\.xlsx$/;
  const folder={
    supported:()=>typeof window.showDirectoryPicker==='function',
    async pick(){return window.showDirectoryPicker({id:'work-schedule',mode:'readwrite'})},
    async permission(dir,ask){
      if(!dir)return'denied';
      if(typeof dir.queryPermission!=='function')return'granted';
      let s=await dir.queryPermission({mode:'readwrite'});
      if(s!=='granted'&&ask)s=await dir.requestPermission({mode:'readwrite'});
      return s;
    },
    // 반환: [{name, Y, n, handle, mtime}]  연도·주차 오름차순
    async list(dir){
      const out=[];
      for await(const [name,hd] of dir.entries()){
        if(hd.kind!=='file')continue;
        const m=name.normalize('NFC').match(FILE_RE);if(!m)continue;
        let mtime=0;try{mtime=(await hd.getFile()).lastModified}catch(e){}
        out.push({name,Y:+m[1],n:+m[2],handle:hd,mtime});
      }
      return out.sort((a,b)=>a.Y-b.Y||a.n-b.n);
    },
    async read(handle){return (await handle.getFile()).arrayBuffer()},
    async write(dir,name,bytes){
      const fh=await dir.getFileHandle(name,{create:true});
      const w=await fh.createWritable();
      try{await w.write(bytes);await w.close()}catch(e){try{await w.abort()}catch(_){}throw e}
      return fh;
    },
    fileName:(Y,n)=>`업무일정_${Y}_W${String(n).padStart(2,'0')}.xlsx`
  };
  return{kv,folder};
})();
