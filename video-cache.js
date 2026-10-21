// Keep only one responsive codec family in memory (six legs plus reset).
// Each short clip is fully
// downloaded before its object URL reaches the video decoder.
export function createVideoCache(){
 let entries=new Map(),queue=[],active=null,hidden=false,eager=false,destroyed=false;
 function reset(){
  active?.controller.abort();active=null;queue=[];
  for(const entry of entries.values()){
   if(entry.objectURL)URL.revokeObjectURL(entry.objectURL);
   entry.waiters.clear();
  }
  entries=new Map();
 }
 function configure(urls,{preload=false}={}){
  if(destroyed)return;
  const key=urls.join('|');
  if([...entries.keys()].join('|')!==key){reset();for(const url of urls)entries.set(url,{url,state:'idle',waiters:new Set(),objectURL:null});}
  eager=preload;
  if(!eager&&active&&!active.entry.waiters.size){
   const interrupted=active.entry;active.controller.abort();active=null;interrupted.state='idle';
  }
  if(eager)for(const entry of entries.values())if(entry.state==='idle'&&!queue.includes(entry))queue.push(entry);
  pump();
 }
 function pump(){
  if(active||destroyed)return;
  const index=queue.findIndex(entry=>entry.waiters.size||(!hidden&&eager));
  if(index<0)return;
  const entry=queue.splice(index,1)[0],controller=new AbortController();
  const task={entry,controller};active=task;entry.state='loading';
  let timeout;
  const guard=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),30000);};
  guard();
  (async()=>{
   const response=await fetch(entry.url,{signal:controller.signal});
   if(!response.ok)throw new Error(`Video download failed: ${response.status}`);
   guard();let blob;
   if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;guard();chunks.push(value);}
    blob=new Blob(chunks,{type:response.headers.get('Content-Type')||(entry.url.split('?')[0].endsWith('.webm')?'video/webm':'video/mp4')});
   }else blob=await response.blob();
   if(active!==task||destroyed||controller.signal.aborted)return;
   entry.objectURL=URL.createObjectURL(blob);entry.state='ready';
   const waiters=[...entry.waiters];entry.waiters.clear();for(const waiter of waiters)waiter.ready(entry.objectURL);
  })().catch(error=>{
   if(active!==task||destroyed)return;
   entry.state='failed';const waiters=[...entry.waiters];entry.waiters.clear();for(const waiter of waiters)waiter.error(error);
  }).finally(()=>{clearTimeout(timeout);if(active===task){active=null;pump();}});
 }
 function request(url,ready,error){
  const entry=entries.get(url);if(!entry){error(new Error('Video is not in the active responsive set'));return()=>{};}
  if(entry.state==='ready'){ready(entry.objectURL);return()=>{};}
  const waiter={ready,error};entry.waiters.add(waiter);
  if(active&&active.entry!==entry&&!active.entry.waiters.size){
   const interrupted=active.entry;active.controller.abort();active=null;interrupted.state='idle';
   if(eager&&!queue.includes(interrupted))queue.push(interrupted);
  }
  queue=queue.filter(candidate=>candidate!==entry);
  if(entry.state!=='loading'){entry.state='idle';queue.unshift(entry);}
  pump();
  return()=>{
   entry.waiters.delete(waiter);
   if(!eager&&!entry.waiters.size){
    queue=queue.filter(candidate=>candidate!==entry);
    if(active?.entry===entry){active.controller.abort();active=null;entry.state='idle';pump();}
   }
  };
 }
 return {configure,request,setHidden(value){hidden=value;if(!value)pump();},destroy(){destroyed=true;reset();}};
}
