const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {Recordings, header} = require('../electron/recordings.cjs');
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-test-')); t.after(() => fs.rm(dir, {recursive:true,force:true})); const store = new Recordings(dir); await store.init(); return store; }
test('PCM is persisted in order as a playable mono WAV', async t => {
  const store = await fixture(t), {id} = await store.start(48000);
  const first = Buffer.alloc(9600, 23), second = Buffer.alloc(9600, 42);
  await store.append(id, first); await store.append(id, second); await store.finish(id);
  const data = await fs.readFile(store.file(id)); assert.equal(data.toString('ascii',0,4),'RIFF'); assert.equal(data.readUInt32LE(40),19200); assert.equal(data.readUInt32LE(24),48000);
  assert.deepEqual(data.subarray(44),Buffer.concat([first,second])); assert.equal((await store.list())[0].duration,.2);
});
test('interrupted PCM is recovered, including trimming an incomplete sample', async t => {
  const store = await fixture(t), {id} = await store.start(44100);
  await store.append(id, Buffer.alloc(8820, 17)); await store.active.handle.close(); store.active=null;
  await fs.appendFile(`${store.file(id)}.partial`, Buffer.from([1]));
  const restarted = new Recordings(store.dir); await restarted.init();
  const rows = await restarted.list(); assert.equal(rows.length,1); assert.equal(rows[0].duration,.1); assert.equal(rows[0].size,8864);
});
test('recording IDs, rates, audio chunks and overlapping takes are validated', async t => {
  const store = await fixture(t); assert.throws(() => store.file('../../escape')); await assert.rejects(store.start(-1));
  const {id} = await store.start(48000); await assert.rejects(store.start(48000)); await assert.rejects(store.append(id, Buffer.alloc(3))); await assert.rejects(store.append('wrong',Buffer.alloc(2))); await store.finish(id);
});
test('WAV size and sample rate are consistent', () => {const h=header(96000,48000); assert.equal(h.readUInt32LE(4),96036);assert.equal(h.readUInt32LE(28),96000);assert.equal(h.readUInt16LE(34),16);});
test('preview waveform is derived from saved PCM, bounded and rejects other paths', async t => {
 const store=await fixture(t), {id}=await store.start(48000);
 const pcm=Buffer.alloc(96000);for(let i=0;i<48000;i++)pcm.writeInt16LE(i<24000 ? 0 : -16384,i*2);
 await store.append(id,pcm);await store.finish(id);
 const wave=await store.waveform(id);assert.equal(wave.duration,1);assert.equal(wave.peaks.length,1200);assert.equal(wave.peaks[0],0);assert.equal(wave.peaks[1199],.5);await assert.rejects(store.waveform('../escape'));
});
