export function cleanScript(text, name = '') {
  text = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/\.(srt|vtt)$/i.test(name)) return text.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) return '';
    const timestamp = lines.findIndex(line => line.includes('-->'));
    return (timestamp >= 0 ? lines.slice(timestamp + 1) : lines).join('\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }).filter(Boolean).join('\n\n');
  return text;
}
export function wordCount(text) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
export function timeLabel(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
}
export function chooseInput(devices, preferred = '') {
 const inputs=devices.filter(d=>d.kind==='audioinput');
 if(preferred && inputs.some(d=>d.deviceId===preferred)) return preferred;
 const virtual=/virtual|loopback|speaker audio recorder|teams audio/i;
 const normal=inputs.find(d=>d.deviceId==='default');
 if(normal && !virtual.test(normal.label)) return normal.deviceId;
 return inputs.find(d=>d.deviceId!=='default' && !virtual.test(d.label))?.deviceId || normal?.deviceId || inputs[0]?.deviceId || '';
}
