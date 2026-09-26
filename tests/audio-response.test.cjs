const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {audioResponse}=require('../electron/audio-response.cjs');
test('audio transport supports byte ranges for seeking, suffixes, HEAD and invalid ranges',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'voice-range-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'test.wav');await fs.writeFile(file,Buffer.from('0123456789'));
 const req=(range,method='GET')=>new Request('https://local/audio',{method,headers:range?{range}:{}});
 let r=await audioResponse(file,req());assert.equal(r.status,200);assert.equal(r.headers.get('accept-ranges'),'bytes');assert.equal(await r.text(),'0123456789');
 r=await audioResponse(file,req('bytes=3-6'));assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 3-6/10');assert.equal(await r.text(),'3456');
 r=await audioResponse(file,req('bytes=-3'));assert.equal(await r.text(),'789');
 r=await audioResponse(file,req('bytes=8-'));assert.equal(await r.text(),'89');
 for(const range of ['bytes=50-','bytes=6-2','bytes=0-1,3-4','bytes=-0','bytes=-'])assert.equal((await audioResponse(file,req(range))).status,416);
 r=await audioResponse(file,req(null,'HEAD'));assert.equal(r.headers.get('content-length'),'10');assert.equal(await r.text(),'');
});
