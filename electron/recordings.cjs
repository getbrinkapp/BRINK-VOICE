const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ID = /^[a-f0-9-]{36}$/;
const MAX_BYTES = 0xffffffff - 36;
function header(bytes, rate) {
  const b = Buffer.alloc(44);
  b.write('RIFF'); b.writeUInt32LE(bytes + 36, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40); return b;
}
class Recordings {
  constructor(dir) { this.dir = dir; this.active = null; this.metaQueue=Promise.resolve(); }
  file(id) { if (!ID.test(id)) throw Error('Ungültige Aufnahme.'); return path.join(this.dir, `${id}.wav`); }
  async init() {
    await fs.mkdir(this.dir, {recursive: true});
    // Recover the valid PCM prefix of interrupted takes without discarding audio.
    for (const name of await fs.readdir(this.dir)) {
      if (!name.endsWith('.wav.partial') || !ID.test(name.slice(0, -12))) continue;
      const p = path.join(this.dir, name); const h = await fs.open(p, 'r+');
      try {
        const s = await h.stat();
        if (s.size < 44) continue;
        const b = Buffer.alloc(44); await h.read(b, 0, 44, 0);
        const rate = b.readUInt32LE(24); const bytes = Math.min(MAX_BYTES, Math.floor((s.size - 44) / 2) * 2);
        await h.truncate(bytes + 44); await h.write(header(bytes, rate), 0, 44, 0); await h.sync();
      } finally { await h.close(); }
      await fs.rename(p, p.slice(0, -8));
    }
  }
  async start(rate) {
    if (this.active) throw Error('Eine Aufnahme läuft bereits.');
    if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) throw Error('Ungültige Abtastrate.');
    const id = randomUUID(); const file = `${this.file(id)}.partial`;
    const handle = await fs.open(file, 'wx');
    try { await handle.write(header(0, rate), 0, 44, 0); }
    catch (e) { await handle.close(); throw e; }
    this.active = {id, rate, file, handle, bytes: 0}; return {id};
  }
  async append(id, data) {
    const a = this.active;
    if (!a || a.id !== id) throw Error('Keine passende Aufnahme aktiv.');
    if (!(data instanceof Uint8Array) || !data.length || data.length > 1024 * 1024 || data.length % 2) throw Error('Ungültige Audiodaten.');
    if (a.bytes + data.length > MAX_BYTES) throw Error('Die maximale WAV-Dateigröße ist erreicht. Bitte neuen Take starten.');
    let offset = 0;
    while (offset < data.length) {
      const result = await a.handle.write(data, offset, data.length - offset, 44 + a.bytes + offset);
      if (!result.bytesWritten) throw Error('Aufnahme konnte nicht geschrieben werden.');
      offset += result.bytesWritten;
    }
    a.bytes += data.length;
  }
  async finish(id) {
    const a = this.active; if (!a || a.id !== id) throw Error('Keine passende Aufnahme aktiv.');
    try { await a.handle.write(header(a.bytes, a.rate), 0, 44, 0); await a.handle.sync(); }
    finally { await a.handle.close(); this.active = null; }
    await fs.rename(a.file, this.file(id)); return {id, duration: a.bytes / (a.rate * 2)};
  }
  async waveform(id, view = {}) {
    const h = await fs.open(this.file(id), 'r');
    try {
      const head = Buffer.alloc(44); await h.read(head, 0, 44, 0);
      const samples = Math.floor(head.readUInt32LE(40) / 2);
      const rate = head.readUInt32LE(24);
      const start=Number.isFinite(view.start)?Math.max(0,Math.min(samples,Math.floor(view.start*rate))):0;
      const end=Number.isFinite(view.end)?Math.max(start,Math.min(samples,Math.ceil(view.end*rate))):samples;
      const count=end-start,bins=Number.isInteger(view.bins)?Math.max(100,Math.min(6000,view.bins)):1200;
      const peaks = new Array(Math.min(bins, count)).fill(0);
      const block = Buffer.alloc(262144);
      for (let offset = 0; offset < count * 2;) {
        const {bytesRead} = await h.read(block, 0, Math.min(block.length, count * 2 - offset), 44 + start * 2 + offset);
        if (!bytesRead) break;
        for (let i = 0; i + 1 < bytesRead; i += 2) {
          const bin = Math.min(peaks.length - 1, Math.floor(((offset + i) / 2) / count * peaks.length));
          peaks[bin] = Math.max(peaks[bin], Math.abs(block.readInt16LE(i)) / 32768);
        }
        offset += bytesRead;
      }
      return {peaks, duration: samples / rate};
    } finally { await h.close(); }
  }
  async metadata(id) {try{return JSON.parse(await fs.readFile(this.file(id)+'.json','utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
  async patchMetadata(id,patch) {
    const task=this.metaQueue.then(async()=>{await fs.access(this.file(id));const previous=await this.metadata(id),next={...previous};
      for(const key of ['name','favorite','scriptId','projectId'])if(key in patch){const value=patch[key];if(key==='name' && (typeof value!=='string'||value.length>160))throw Error('Ungültiger Name.');if(key==='favorite'&&typeof value!=='boolean')throw Error('Ungültiger Favorit.');if(['scriptId','projectId'].includes(key)&&value!==null&&!ID.test(value))throw Error('Ungültige Zuordnung.');next[key]=key==='name'?value.trim():value;}
      const temp=this.file(id)+'.json.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(next),{flag:'wx'});await fs.rename(temp,this.file(id)+'.json');}finally{await fs.unlink(temp).catch(()=>{});}return next;
    });this.metaQueue=task.catch(()=>{});return task;
  }
  async list() {
    const names = (await fs.readdir(this.dir)).filter(n => ID.test(n.slice(0, -4)) && n.endsWith('.wav'));
    const rows = await Promise.all(names.map(async n => {
      const p = path.join(this.dir, n); const h = await fs.open(p, 'r');
      try { const b = Buffer.alloc(44); await h.read(b, 0, 44, 0); const s = await h.stat();
        const meta=await this.metadata(n.slice(0,-4));
        return {name:meta.name||'',favorite:!!meta.favorite,scriptId:meta.scriptId||null,projectId:meta.projectId||null,sourceId:meta.sourceId||null,kind:['cleaned','edited','imported'].includes(meta.kind)?meta.kind:undefined, id: n.slice(0, -4), created: s.birthtimeMs, duration: b.readUInt32LE(40) / b.readUInt32LE(28), size: s.size, rate: b.readUInt32LE(24)};
      } finally { await h.close(); }
    })); return rows.sort((a, b) => b.created - a.created);
  }
}
module.exports = {Recordings, header};
