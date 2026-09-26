const {Worker}=require('node:worker_threads'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {settings}=require('./audio-settings.cjs'),{wavInfo,ranges}=require('./edits.cjs'),{atomic}=require('./library.cjs');
class AudioJobs {
 constructor(store,root){this.store=store;this.root=root;this.jobs=new Map();this.active=null;}
 async init(){await fs.mkdir(this.root,{recursive:true});await fs.mkdir(path.join(this.root,'previews'),{recursive:true});}
 preview(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Ungültige Vorschau.');return path.join(this.root,'previews',id+'.wav');}
 async start(input){
  if(this.active||this.store.active)throw Error('Bitte die laufende Aufnahme oder Verarbeitung zuerst beenden.');
  const effects=settings(input.effects);const id=randomUUID();const job={id,state:'running',progress:0,label:'Wird vorbereitet',worker:null};this.active=job;this.jobs.set(id,job);
  try{
   const source=input.operation==='import'?input.source:this.store.file(input.id);let metadata={};
   if(input.operation!=='import'){ranges(input.cuts||[],await wavInfo(source));metadata=await this.store.metadata(input.id);}
   const outputId=randomUUID(),final=input.preview?this.preview(outputId):this.store.file(outputId),temp=final+'.rendering';
   const worker=new Worker(path.join(__dirname,'audio-worker.cjs'),{workerData:{operation:input.operation||'render',source,target:temp,tempRoot:this.root,effects,cuts:input.cuts||[]}});job.worker=worker;
   const fail=async message=>{if(job.state!=='running')return;job.state=job.cancelled?'cancelled':'error';job.error=message;await fs.unlink(temp).catch(()=>{});this.active=null;};
   worker.on('message',async msg=>{
    if(msg.type==='progress'){job.progress=msg.value;job.label=msg.label;}
    if(msg.type==='error')await fail(msg.error);
    if(msg.type==='done'){
     try{
      if(job.cancelled){await fail('Abgebrochen.');return;}
      if(!input.preview){const meta={...metadata,kind:input.operation==='import'?'imported':'edited',name:input.name||(metadata.name?metadata.name+' · Bearbeitet':''),sourceId:input.id||null,effects:input.operation==='import'?undefined:effects,cuts:input.cuts||[],created:Date.now()};await atomic(final+'.json',meta);}
      if(job.cancelled)throw Error('Abgebrochen.');
      await fs.rename(temp,final);job.result={id:outputId,preview:!!input.preview,...msg.info};job.state='done';job.progress=1;this.active=null;
     }catch(e){await fs.unlink(final+'.json').catch(()=>{});await fail(e.message);}
    }
   });worker.on('error',e=>void fail(e.message));worker.on('exit',code=>{if(code!==0)void fail('Audioverarbeitung wurde unterbrochen.');});
   // Retain only recent status entries. Preview files are removed explicitly or at next launch.
   while(this.jobs.size>20){const key=this.jobs.keys().next().value;if(key===id)break;this.jobs.delete(key);}
   return {jobId:id};
  }catch(e){this.active=null;this.jobs.delete(id);throw e;}
 }
 status(id){const j=this.jobs.get(id);if(!j)throw Error('Auftrag nicht gefunden.');return {id:j.id,state:j.state,progress:j.progress,label:j.label,error:j.error,result:j.result};}
 cancel(id){const j=this.jobs.get(id);if(j?.state==='running'){j.cancelled=true;j.worker.postMessage('cancel');}return true;}
}
module.exports={AudioJobs};
