const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {header}=require('./recordings.cjs'),{render,wavInfo}=require('./edits.cjs'),{settings,filters}=require('./audio-settings.cjs');
let cancelled=false,child=null;parentPort.on('message',m=>{if(m==='cancel'){cancelled=true;child?.kill('SIGKILL');}});
const check=()=>{if(cancelled)throw Error('Abgebrochen.');};
const progress=(value,label)=>parentPort.postMessage({type:'progress',value,label});
async function run(args){check();await new Promise((resolve,reject)=>{let error='';child=spawn(require('ffmpeg-static').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep),['-nostdin','-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','ignore','pipe'],windowsHide:true});child.stderr.on('data',b=>error=(error+b).slice(-3000));child.once('error',reject);child.once('close',code=>{child=null;code===0?resolve():reject(Error(cancelled?'Abgebrochen.':`Audioverarbeitung fehlgeschlagen: ${error}`));});});check();}
async function writeAll(file,buffer){let offset=0;while(offset<buffer.length){const {bytesWritten}=await file.write(buffer,offset,buffer.length-offset);if(!bytesWritten)throw Error('Schreibfehler.');offset+=bytesWritten;}}
async function pack(raw,target,rate){const size=(await fs.stat(raw)).size;if(!size||size%2||size>0xffffffff-36)throw Error('Leere oder zu große Audiodatei.');const input=await fs.open(raw,'r'),out=await fs.open(target,'wx');try{await out.write(header(size,rate));const block=Buffer.alloc(262144);let at=0;while(at<size){check();const {bytesRead}=await input.read(block,0,Math.min(block.length,size-at),at);if(!bytesRead)throw Error('Audio unvollständig.');let n=0;while(n<bytesRead){const r=await out.write(block,n,bytesRead-n,44+at+n);if(!r.bytesWritten)throw Error('Schreibfehler.');n+=r.bytesWritten;}at+=bytesRead;}await out.sync();}finally{await input.close();await out.close();}}
async function denoise(source,target,amount){
 const {default:create}=await import(pathToFileURL(path.join(__dirname,'vendor/rnnoise.mjs')).href);const rn=create();await rn.ready;const state=rn._rnnoise_create(0),pointer=rn._malloc(480*4),start=pointer/4;
 const input=await fs.open(source,'r'),output=await fs.open(target,'wx'),total=(await input.stat()).size/4;
 const block=Buffer.alloc(480*4*100),result=Buffer.alloc(480*4*101);let consumed=0,written=0,previous=null;
 function frame(values,length){check();rn.HEAPF32.set(values,start);rn._rnnoise_process_frame(state,pointer,pointer);let bytes=0;
  // RNNoise has one 10 ms frame of look-ahead. Flush it and align wet/dry audio.
  if(previous){const n=Math.min(480,total-written);for(let j=0;j<n;j++){const wet=rn.HEAPF32[start+j]/32768,dry=previous[j]/32768;result.writeFloatLE(wet*amount+dry*(1-amount),j*4);}written+=n;bytes=n*4;}
  previous=values;return bytes;
 }
 try{while(consumed<total){check();const count=Math.min(block.length/4,total-consumed);let read=0;while(read<count*4){const r=await input.read(block,read,count*4-read,consumed*4+read);if(!r.bytesRead)throw Error('Audio unvollständig.');read+=r.bytesRead;}
  const chunks=[];for(let at=0;at<count;at+=480){const values=new Float32Array(480),n=Math.min(480,count-at);for(let j=0;j<n;j++)values[j]=block.readFloatLE((at+j)*4)*32768;const bytes=frame(values,n);if(bytes)chunks.push(Buffer.from(result.subarray(0,bytes)));}
  if(chunks.length)await writeAll(output,Buffer.concat(chunks));consumed+=count;progress(.3+.45*consumed/total,'Stimme isolieren');}
 const bytes=frame(new Float32Array(480),0);if(bytes)await writeAll(output,result.subarray(0,bytes));await output.sync();
 }finally{rn._free(pointer);rn._rnnoise_destroy(state);await input.close();await output.close();}
}
(async()=>{
 const job=workerData;const dir=await fs.mkdtemp(path.join(job.tempRoot,'audio-'));
 try{
  const fx=settings(job.effects);let source=job.source;
  if(job.operation==='import'){
   progress(.1,'Audio importieren');const raw=path.join(dir,'import.raw');await run(['-protocol_whitelist','file,pipe','-i',source,'-map','0:a:0','-vn','-sn','-dn','-ac','1','-ar','48000','-f','s16le',raw]);await pack(raw,job.target,48000);
  }else{
   progress(.05,'Schnitte vorbereiten');const cut=path.join(dir,'cut.wav');await render(source,cut,job.cuts||[],check,p=>progress(.05+.15*p,'Schnitte anwenden'));source=cut;
   if(fx.isolation){const raw=path.join(dir,'voice.raw'),isolated=path.join(dir,'isolated.raw');await run(['-i',source,'-ac','1','-ar','48000','-f','f32le',raw]);await denoise(raw,isolated,fx.isolation/100);source=isolated;}
   progress(.78,'Effekte und Lautstärke berechnen');const raw=path.join(dir,'final.raw');const input=fx.isolation?['-f','f32le','-ar','48000','-ac','1','-i',source]:['-i',source];
   await run([...input,'-af',filters(fx),'-ac','1','-ar','48000','-f','s16le',raw]);await pack(raw,job.target,48000);
  }
  check();const info=await wavInfo(job.target);progress(1,'Fertig');parentPort.postMessage({type:'done',info});
 }catch(e){await fs.unlink(job.target).catch(()=>{});parentPort.postMessage({type:'error',error:e.message,cancelled});}
 finally{await fs.rm(dir,{recursive:true,force:true});parentPort.close();}
})().catch(e=>{parentPort.postMessage({type:'error',error:e.message});parentPort.close();});
