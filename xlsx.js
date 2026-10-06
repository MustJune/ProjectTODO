/*
 * xlsx.js — 엑셀(.xlsx) 파일 생성·읽기 모듈 (외부 라이브러리 없음)
 *  - XL.build(sheets) : 시트 배열 → .xlsx 바이트(Uint8Array). ZIP 무압축 저장 방식.
 *  - XL.parse(buffer) : .xlsx 바이트 → [{name, rows}] . 엑셀이 다시 저장한 압축 파일도 읽음(DecompressionStream).
 * 참고 규격: ECMA-376 (Office Open XML), PKWARE ZIP APPNOTE
 */
'use strict';
window.XL=(()=>{
  const enc=new TextEncoder(), dec=new TextDecoder();
  const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
  const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
  // ZIP (무압축 저장)
  function zip(files){
    const parts=[],cen=[];let off=0;
    for(const f of files){
      const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
      const lh=new DataView(new ArrayBuffer(30));
      lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);
      lh.setUint16(10,0,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);
      lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
      parts.push(new Uint8Array(lh.buffer),name,data);
      const ch=new DataView(new ArrayBuffer(46));
      ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);
      ch.setUint16(12,0,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);
      ch.setUint16(28,name.length,true);ch.setUint32(42,off,true);
      cen.push(new Uint8Array(ch.buffer),name);
      off+=30+name.length+data.length;
    }
    const cenSize=cen.reduce((a,b)=>a+b.length,0);
    const end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
    end.setUint32(12,cenSize,true);end.setUint32(16,off,true);
    const all=[...parts,...cen,new Uint8Array(end.buffer)],out=new Uint8Array(all.reduce((a,b)=>a+b.length,0));
    let p=0;for(const a of all){out.set(a,p);p+=a.length}
    return out;
  }
  async function unzip(buf){
    const u=new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength),files={};
    let e=-1;for(let i=u.length-22;i>=Math.max(0,u.length-65558);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
    if(e<0)throw new Error('엑셀(.xlsx) 파일이 아니거나 파일이 손상되었습니다.');
    const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);
    for(let k=0;k<n;k++){
      const method=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
      const name=dec.decode(u.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
      const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),raw=u.subarray(ds,ds+cs);
      files[name]={method,raw};
    }
    const read=async name=>{const f=files[name];if(!f)return null;
      if(f.method===0)return dec.decode(f.raw);
      if(f.method!==8)throw new Error('지원하지 않는 압축 방식입니다.');
      if(typeof DecompressionStream==='undefined')throw new Error('이 브라우저는 엑셀 파일 읽기를 지원하지 않습니다. 최신 Chrome을 사용하세요.');
      const st=new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(st).arrayBuffer())};
    return{read,names:Object.keys(files)};
  }
  const esc=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const col=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2ECF6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  // sheets: [{name, header:[...], widths:[...], types:['s'|'w'|'d'|'n'], rows:[[...]]}]
  function build(sheets){
    const files=[];
    const sheetXml=sh=>{
      const cell=(v,c,r,t,hdr)=>{const ref=col(c)+r;
        if(hdr)return`<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        if(v==null||v==='')return'';
        if(t==='d')return`<c r="${ref}" s="2"><v>${v+25569}</v></c>`;
        if(t==='n')return`<c r="${ref}"><v>${Number(v)}</v></c>`;
        return`<c r="${ref}" s="${t==='w'?3:0}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`};
      const rows=[`<row r="1">${sh.header.map((v,c)=>cell(v,c,1,'s',true)).join('')}</row>`];
      sh.rows.forEach((r,i)=>rows.push(`<row r="${i+2}">${r.map((v,c)=>cell(v,c,i+2,sh.types[c])).join('')}</row>`));
      return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sh.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
    };
    files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`});
    files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`});
    files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${RNS}"><bookViews><workbookView activeTab="${sheets.length-1}"/></bookViews><sheets>${sheets.map((sh,i)=>`<sheet name="${esc(sh.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`});
    files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
    files.push({name:'xl/styles.xml',data:STYLES});
    sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(sh)}));
    return zip(files);
  }
  // 반환: [{name, rows:[[셀값...]]}]  (숫자는 Number, 문자는 String)
  async function parse(buf){
    const z=await unzip(buf), dp=new DOMParser();
    const xml=async n=>{const t=await z.read(n);return t==null?null:dp.parseFromString(t,'application/xml')};
    const all=(el,tag)=>Array.from(el.getElementsByTagNameNS('*',tag));
    const wb=await xml('xl/workbook.xml');if(!wb)throw new Error('엑셀 통합문서 정보를 찾을 수 없습니다.');
    const rels={},rd=await xml('xl/_rels/workbook.xml.rels');
    if(rd)all(rd,'Relationship').forEach(r=>{let t=r.getAttribute('Target');t=t.startsWith('/')?t.slice(1):'xl/'+t;rels[r.getAttribute('Id')]=t});
    const ss=[],sd=await xml('xl/sharedStrings.xml');
    if(sd)all(sd,'si').forEach(si=>ss.push(all(si,'t').filter(t=>!t.closest||!t.parentNode||t.parentNode.localName!=='rPh').map(t=>t.textContent).join('')));
    const out=[];
    for(const sh of all(wb,'sheet')){
      const rid=sh.getAttributeNS(RNS,'id')||sh.getAttribute('r:id'),path=rels[rid];if(!path)continue;
      const doc=await xml(path);if(!doc)continue;
      const rows=[];
      for(const r of all(doc,'row')){
        const ri=(+r.getAttribute('r')||rows.length+1)-1,row=rows[ri]=rows[ri]||[];
        all(r,'c').forEach((c,k)=>{
          const ref=c.getAttribute('r');let ci=k;
          if(ref){ci=0;for(const ch of ref.replace(/\d+/g,''))ci=ci*26+ch.charCodeAt(0)-64;ci--}
          const t=c.getAttribute('t'),v=c.getElementsByTagNameNS('*','v')[0];
          let val=null;
          if(t==='inlineStr')val=all(c,'t').map(x=>x.textContent).join('');
          else if(v){const x=v.textContent;val=t==='s'?ss[+x]:(t==='str'||t==='e'||t==='b')?x:Number(x)}
          row[ci]=val;
        });
      }
      out.push({name:sh.getAttribute('name'),rows:Array.from(rows,r=>r||[])});
    }
    return out;
  }
  return{build,parse};
})();
