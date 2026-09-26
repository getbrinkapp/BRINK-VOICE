const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Recordings}=require('../electron/recordings.cjs');
const {analyze,clean,options}=require('../electron/silence.cjs');
async function fixture(t,segments,rate=48000){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'voice-silence-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new Recordings(dir);await store.init();const {id}=await store.start(rate);
 let phase=0;for(const [seconds,amplitude]of segments){const pcm=Buffer.alloc(Math.round(seconds*rate)*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(phase++/rate*Math.PI*880)*amplitude*32767),i*2);for(let i=0;i<pcm.length;i+=262144)await store.append(id,pcm.subarray(i,i+262144));}
 await store.finish(id);return {store,id,rate};
}
test('silence cleanup removes leading, middle and trailing gaps and preserves original PCM',async t=>{
 const {store,id,rate}=await fixture(t,[[.6,0],[.5,.2],[1,0],[.5,.08],[.6,0]]);
 const original=await fs.readFile(store.file(id)),plan=await analyze(store.file(id));
 assert.equal(plan.count,3);assert.equal(plan.original,3.2);assert.ok(Math.abs(plan.duration-1.16)<.011);
 const result=await clean(store,id),output=await fs.readFile(store.file(result.id));
 assert.deepEqual(await fs.readFile(store.file(id)),original);
 assert.equal(output.readUInt32LE(40),output.length-44);assert.equal(output.readUInt32LE(24),rate);
 assert.equal((output.length-44)/2/rate,result.duration);
 const rows=await store.list();assert.equal(rows.length,2);assert.equal(rows.find(t=>t.id===result.id).kind,'cleaned');
 // Both spoken sections are sample-identical away from the 3 ms cut fades.
 const start=plan.cuts[0][1];assert.deepEqual(output.subarray(44+rate*.05*2,44+rate*.2*2),original.subarray(44+(start+rate*.05)*2,44+(start+rate*.2)*2));
 let maximumZero=0,run=0;for(let i=44;i<output.length;i+=2){if(output.readInt16LE(i)===0)run++;else run=0;maximumZero=Math.max(maximumZero,run);}assert.ok(maximumZero/rate<.13);
});
test('short natural pauses and low level speech survive; no-gap and all-silence never create empty takes',async t=>{
 const {store,id}=await fixture(t,[[.5,.025],[.2,0],[.5,.025]]);
 assert.equal((await analyze(store.file(id))).count,0);await assert.rejects(clean(store,id),/keine längeren Lücken/);assert.equal((await store.list()).length,1);
 const silent=await fixture(t,[[2,0]]);assert.equal((await analyze(silent.store.file(silent.id))).audible,false);await assert.rejects(clean(silent.store,silent.id),/Kein Sprachsignal/);assert.equal((await silent.store.list()).length,1);
});
test('threshold, minimum gap and retained pause are honored across block boundaries at 44.1 kHz',async t=>{
 const {store,id}=await fixture(t,[[.6,.2],[.8,.005],[.6,.2]],44100);
 const quiet=await analyze(store.file(id),{threshold:-60});assert.equal(quiet.count,0);
 const cut=await analyze(store.file(id),{keep:0});assert.equal(cut.count,1);assert.ok(Math.abs(cut.removed-.76)<.011);
 assert.equal((await analyze(store.file(id),{minimum:1})).count,0);
 const kept=await analyze(store.file(id),{keep:.15});assert.ok(Math.abs(cut.removed-kept.removed-.15)<.001);
 const result=await clean(store,id,{keep:0});assert.equal((await fs.readFile(store.file(result.id))).readUInt32LE(24),44100);
});
test('edits validate settings, file IDs and active recordings',async t=>{
 for(const value of [{threshold:NaN},{threshold:-100},{minimum:0},{keep:2},{minimum:.15,keep:.2}])assert.throws(()=>options(value));
 const {store,id}=await fixture(t,[[.5,.2],[.8,0],[.5,.2]]);await assert.rejects(clean(store,'../outside'),/Ungültige Aufnahme/);
 const active=await store.start(48000);await assert.rejects(clean(store,id),/zuerst/);await store.finish(active.id);
});
test('manual cuts determine exact output duration and samples, without replacing the original',async t=>{
 const {store,id,rate}=await fixture(t,[[.6,.2],[.8,0],[.6,.2]],44100);
 const before=await fs.readFile(store.file(id)),custom=[[.8,1.2]];
 const result=await clean(store,id,{},custom),after=await fs.readFile(store.file(result.id));
 assert.deepEqual(result.cuts,custom);assert.equal(result.removed,.4);assert.equal(result.duration,1.6);
 assert.equal(after.length,44+Math.round(1.6*rate)*2);assert.deepEqual(await fs.readFile(store.file(id)),before);
 // Interior samples from both sides of the requested cut are preserved in order.
 assert.deepEqual(after.subarray(44+rate*.2*2,44+rate*.4*2),before.subarray(44+rate*.2*2,44+rate*.4*2));
 assert.deepEqual(after.subarray(44+Math.round(rate*1.1)*2,44+Math.round(rate*1.3)*2),before.subarray(44+Math.round(rate*1.5)*2,44+Math.round(rate*1.7)*2));
 const metadata=JSON.parse(await fs.readFile(store.file(result.id)+'.json','utf8'));assert.deepEqual(metadata.cuts,custom);
});
test('manual ranges reject malformed, reversed, overlapping, out of bounds and empty output edits before writing',async t=>{
 const {store,id}=await fixture(t,[[.6,0],[.5,.2],[1,0],[.5,.2],[.6,0]]);
 const {applyCuts}=require('../electron/silence.cjs'),plan=await analyze(store.file(id));
 for(const cuts of [null,[],[[0,.4]],[[0,.4],[.3,1],[2,3]],[[0,.4],[2,1],[2.2,3]],[[0,.4],[1,2],[2,4]],[[0,NaN],[1,2],[2,3]],[[0,.4],['1',2],[2,3]],[[0,.4],[1,1],[2,3]],[[0,1],[1,2],[2,3.2]]]) {
  assert.throws(()=>applyCuts(plan,cuts),/Ungültige Schnittgrenzen/);
  await assert.rejects(clean(store,id,{},cuts),/Ungültige Schnittgrenzen/);
 }
 assert.equal((await store.list()).length,1);
 assert.equal((await fs.readdir(store.dir)).length,1);
});
