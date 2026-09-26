const fs = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const {header} = require('./recordings.cjs');
function options(value = {}) {
  const result = {threshold: value.threshold ?? -42, minimum: value.minimum ?? .4, keep: value.keep ?? .08};
  for (const [key, min, max] of [['threshold',-65,-20],['minimum',.15,3],['keep',0,.5]]) {
    if (!Number.isFinite(result[key]) || result[key] < min || result[key] > max) throw Error('Ungültige Einstellung für die Lückenbereinigung.');
  }
  if (result.keep >= result.minimum) throw Error('Die Restpause muss kürzer als die Mindestlücke sein.');
  return result;
}
async function analyze(file, value) {
  const settings = options(value), handle = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(44); await handle.read(head,0,44,0);
    const rate = head.readUInt32LE(24), samples = head.readUInt32LE(40)/2;
    if (head.toString('ascii',0,4)!=='RIFF' || head.toString('ascii',8,16)!=='WAVEfmt ' || head.toString('ascii',36,40)!=='data' || head.readUInt16LE(20)!==1 || head.readUInt16LE(22)!==1 || head.readUInt16LE(34)!==16 || rate<8000 || rate>192000 || !Number.isInteger(samples) || (await handle.stat()).size < 44+samples*2) throw Error('Die Aufnahme ist keine gültige VOICE-WAV-Datei.');
    const frame = Math.round(rate*.01), threshold = 10**(settings.threshold/20), block = Buffer.alloc(frame*2*100);
    const gaps = []; let silentStart = null, audible = false;
    for (let offset=0; offset<samples;) {
      const count = Math.min(block.length/2,samples-offset); // Reads remain bounded for long takes.
      let read=0; while(read<count*2) {const r=await handle.read(block,read,count*2-read,44+offset*2+read);if(!r.bytesRead)throw Error('Die Aufnahme ist unvollständig.');read+=r.bytesRead;}
      for(let i=0;i<count;i+=frame) {
        const length=Math.min(frame,count-i);let energy=0;
        for(let j=0;j<length;j++){const v=block.readInt16LE((i+j)*2)/32768;energy+=v*v;}
        if(Math.sqrt(energy/length)<threshold){if(silentStart===null)silentStart=offset+i;}
        else {audible=true;if(silentStart!==null){gaps.push([silentStart,offset+i]);silentStart=null;}}
      }
      offset+=count;
    }
    if(silentStart!==null)gaps.push([silentStart,samples]);
    // Protect consonants adjacent to an RMS boundary; very short gaps remain natural.
    const pad=Math.round(rate*.02), rest=Math.round(rate*settings.keep/2), cuts=[];
    if(audible)for(const [start,end] of gaps){
      if(end-start<Math.round(rate*settings.minimum))continue;
      const from=start===0?0:start+pad+(end===samples?0:rest), to=end===samples?samples:end-pad-(start===0?0:rest);
      if(to>from)cuts.push([from,to]);
    }
    const removed=cuts.reduce((sum,[a,b])=>sum+b-a,0);
    return {rate,samples,cuts,audible,settings,original:samples/rate,duration:(samples-removed)/rate,removed:removed/rate,count:cuts.length};
  } finally {await handle.close();}
}
function summary(plan) {return {...plan,cuts:plan.cuts.map(([a,b])=>[a/plan.rate,b/plan.rate])};}
function applyCuts(plan, customCuts) {
  if(customCuts === undefined)return plan;
  const invalid=()=>{throw Error('Ungültige Schnittgrenzen. Bitte die Pausen erneut prüfen.');};
  if(!Array.isArray(customCuts) || customCuts.length!==plan.count || customCuts.length>100000)invalid();
  let previous=0,removed=0;
  const cuts=customCuts.map(pair=>{
    if(!Array.isArray(pair) || pair.length!==2 || !pair.every(Number.isFinite))invalid();
    const [start,end]=pair;
    if(start<0 || end>plan.original || start>=end)invalid();
    const a=Math.round(start*plan.rate),b=Math.round(end*plan.rate);
    if(a<previous || b<=a || b>plan.samples)invalid();
    previous=b;removed+=b-a;return [a,b];
  });
  if(removed>=plan.samples)invalid();
  return {...plan,cuts,removed:removed/plan.rate,duration:(plan.samples-removed)/plan.rate};
}
async function clean(store,id,value,customCuts) {
  if(store.active)throw Error('Bitte zuerst die Aufnahme stoppen.');
  const source=store.file(id),plan=applyCuts(await analyze(source,value),customCuts);
  if(!plan.audible)throw Error('Kein Sprachsignal erkannt. Wähle eine niedrigere Schwelle oder einen anderen Take.');
  if(!plan.count)throw Error('Mit diesen Einstellungen wurden keine längeren Lücken gefunden.');
  const outputId=randomUUID(),target=store.file(outputId),temp=target+'.editing';
  const input=await fs.open(source,'r');let output;
  try {
    output=await fs.open(temp,'wx');let written=0;
    async function write(buffer){let n=0;while(n<buffer.length){const r=await output.write(buffer,n,buffer.length-n,44+written+n);if(!r.bytesWritten)throw Error('Die bereinigte Aufnahme konnte nicht gespeichert werden.');n+=r.bytesWritten;}written+=n;}
    const segments=[];let start=0;for(const [a,b]of plan.cuts){if(a>start)segments.push([start,a]);start=b;}if(start<plan.samples)segments.push([start,plan.samples]);
    const block=Buffer.alloc(262144),fade=Math.round(plan.rate*.003);
    for(const [a,b]of segments)for(let offset=a;offset<b;){
      const count=Math.min(block.length/2,b-offset);let read=0;
      while(read<count*2){const r=await input.read(block,read,count*2-read,44+offset*2+read);if(!r.bytesRead)throw Error('Die Aufnahme ist unvollständig.');read+=r.bytesRead;}
      for(let i=0;i<count;i++){
        const index=offset+i;let gain=1;
        if(a>0)gain=Math.min(gain,(index-a)/fade);
        if(b<plan.samples)gain=Math.min(gain,(b-1-index)/fade);
        if(gain<1)block.writeInt16LE(Math.round(block.readInt16LE(i*2)*Math.max(0,gain)),i*2);
      }
      await write(block.subarray(0,count*2));offset+=count;
    }
    await output.write(header(written,plan.rate),0,44,0);await output.sync();await output.close();output=null;
    await fs.writeFile(target+'.json',JSON.stringify({...await store.metadata(id),kind:'cleaned',sourceId:id,removed:plan.removed,cuts:summary(plan).cuts}),{flag:'wx'});
    await fs.rename(temp,target);
    return {id:outputId,...summary(plan)};
  } catch(e){await output?.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});await fs.unlink(target+'.json').catch(()=>{});throw e;}
  finally {await input.close();}
}
module.exports={analyze,summary,clean,options,applyCuts};
