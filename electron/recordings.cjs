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
  constructor(dir) { this.dir = dir; this.active = null; }
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
  async waveform(id) {
    const h = await fs.open(this.file(id), 'r');
    try {
      const head = Buffer.alloc(44); await h.read(head, 0, 44, 0);
      const samples = Math.floor(head.readUInt32LE(40) / 2);
      const rate = head.readUInt32LE(24);
      const peaks = new Array(Math.min(1200, samples)).fill(0);
      const block = Buffer.alloc(262144);
      for (let offset = 0; offset < samples * 2;) {
        const {bytesRead} = await h.read(block, 0, Math.min(block.length, samples * 2 - offset), 44 + offset);
        if (!bytesRead) break;
        for (let i = 0; i + 1 < bytesRead; i += 2) {
          const bin = Math.min(peaks.length - 1, Math.floor(((offset + i) / 2) / samples * peaks.length));
          peaks[bin] = Math.max(peaks[bin], Math.abs(block.readInt16LE(i)) / 32768);
        }
        offset += bytesRead;
      }
      return {peaks, duration: samples / rate};
    } finally { await h.close(); }
  }
  async list() {
    const names = (await fs.readdir(this.dir)).filter(n => ID.test(n.slice(0, -4)) && n.endsWith('.wav'));
    const rows = await Promise.all(names.map(async n => {
      const p = path.join(this.dir, n); const h = await fs.open(p, 'r');
      try { const b = Buffer.alloc(44); await h.read(b, 0, 44, 0); const s = await h.stat();
        let kind; try {kind=JSON.parse(await fs.readFile(p+'.json','utf8')).kind;} catch {}
        return {kind:kind==='cleaned'?'cleaned':undefined, id: n.slice(0, -4), created: s.birthtimeMs, duration: b.readUInt32LE(40) / b.readUInt32LE(28), size: s.size, rate: b.readUInt32LE(24)};
      } finally { await h.close(); }
    })); return rows.sort((a, b) => b.created - a.created);
  }
}
module.exports = {Recordings, header};
