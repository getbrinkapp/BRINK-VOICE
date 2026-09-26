const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){let Processor;const messages=[];const context={AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)}}},Int16Array,Math,registerProcessor:(_,p)=>Processor=p};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/js/pcm-worklet.js'),'utf8'),context);return {p:new Processor(),messages};}
test('PCM records actual samples, acknowledges commands, excludes pauses and flushes tails',()=>{
 const {p,messages}=fixture();const send=type=>p.port.onmessage({data:{type,token:7}});
 p.process([[Float32Array.from([.5,.5])]]);assert.equal(messages.length,0);send('record');assert.equal(messages[0].type,'ack');
 p.process([[Float32Array.from([1,-1,.5]),Float32Array.from([1,-1,-.5])]]);send('pause');
 assert.deepEqual([...new Int16Array(messages.find(m=>m.type==='pcm').buffer)],[32767,-32768,0]);
 const length=messages.length;p.process([[Float32Array.from([.8,.8])]]);assert.equal(messages.length,length);
 send('record');p.process([[Float32Array.from([.25])]]);send('stop');assert.deepEqual([...new Int16Array(messages.filter(m=>m.type==='pcm')[1].buffer)],[8192]);
});
test('metering comes from capture samples and works before recording',()=>{
 const {p,messages}=fixture();for(let i=0;i<16;i++)p.process([[new Float32Array(128).fill(.125)]]);
 assert.equal(messages.length,4);assert.equal(messages[0].type,'level');assert.equal(messages[0].peak,.125);assert.equal(messages[0].rms,.125);
});
