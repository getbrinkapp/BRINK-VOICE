import {cleanScript, wordCount, timeLabel, chooseInput} from './core.mjs';
import {createEditor} from './editor.mjs';
import {createTranscriptionUI} from './transcription-ui.mjs';
import {createLibraryUI} from './library-ui.mjs';
const $ = id => document.getElementById(id);
const api = window.voice;
let micStream, audioContext, analyser, processor, zeroGain, source;
let recording = 'idle', busy = false, takeId = null, writeQueue = Promise.resolve(), writeError = null, recordedSamples = 0;
let pendingSamples = 0, ackId = 0, prompterRunning = false, lastFrame = 0, scrollPosition = 0;
let preferredInput = '', liveHistory = [], latestPeak = 0, latestRms = 0, lastLevelAt = 0, connectedAt = 0, lastAudibleAt = 0, silenceWarned = false, noticeTimeout;
let selectedTake = null, previewPeaks = [], previewGeneration = 0, lastAppliedScroll = 0;
const player = $('previewAudio'); player.volume = .8;
const acknowledgements = new Map();
const icons = root => root.querySelectorAll('[data-icon]').forEach(el => el.style.setProperty('--icon', `url('../assets/icons/${el.dataset.icon}.svg')`));
icons(document);
function notice(message, error = false) { $('noticeText').textContent = message; $('notice').hidden = false; $('notice').dataset.error = String(error); clearTimeout(noticeTimeout); if(!error) noticeTimeout = setTimeout(() => $('notice').hidden = true, 5000); }
$('dismissNotice').onclick = () => $('notice').hidden = true;
function fail(e) { console.error(e); notice(e?.message || 'Die Aktion konnte nicht ausgeführt werden.', true); }
const guarded = fn => async (...args) => {try {await fn(...args);} catch(e) {fail(e);} };
function getSaved() { try {return JSON.parse(localStorage.getItem('brink-voice-draft') || '{}');} catch {return {};} }
let libraryUI=null,cachedTakes=[];
const saved = getSaved(); preferredInput = typeof saved.microphone === 'string' ? saved.microphone : '';
let scriptVisible = saved.showScript === true;
$('script').value = typeof saved.text === 'string' ? saved.text : '';
$('speed').value = Math.min(100, Math.max(10, Number(saved.speed) || 32));
$('fontSize').value = ['24','30','38','46'].includes(saved.fontSize) ? saved.fontSize : '38';
$('sync').checked = saved.sync !== false;
$('theme').value = ['dark','light','system'].includes(saved.theme) ? saved.theme : 'dark';
function saveDraft() {
  try {localStorage.setItem('brink-voice-draft', JSON.stringify({text: $('script').value, speed: $('speed').value, fontSize: $('fontSize').value, sync: $('sync').checked, theme: $('theme').value, microphone: preferredInput, showScript: scriptVisible, activeScriptId: libraryUI?.activeId() || saved.activeScriptId})); $('draftState').textContent = 'Entwurf lokal gespeichert';}
  catch { $('draftState').textContent = 'Entwurf konnte nicht gespeichert werden'; }
}
function applyTheme() { document.documentElement.dataset.theme = $('theme').value === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : $('theme').value; }
$('theme').onchange = () => {applyTheme(); saveDraft();};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme); applyTheme();
function resetPrompter() { $('prompterViewport').scrollTop = 0; scrollPosition = 0; lastAppliedScroll = 0; $('prompterStatus').textContent = 'Am Anfang'; }
function setPrompter(run) {
  prompterRunning = run && scriptVisible && !!$('script').value.trim();
  $('prompterPlay').textContent = prompterRunning ? 'Text pausieren' : 'Text starten';
  $('prompterPlay').setAttribute('aria-label', prompterRunning ? 'Teleprompter pausieren' : 'Teleprompter starten');
  $('prompterStatus').textContent = prompterRunning ? 'Läuft' : ($('prompterViewport').scrollTop > 0 ? 'Pausiert' : 'Am Anfang');
}
function updateScript() {
  $('prompterText').textContent = $('script').value || '';
  $('readerEmpty').hidden = !!$('script').value.trim();
  const words = wordCount($('script').value); $('wordCount').textContent = `${words} Wörter · ca. ${timeLabel(words / 140 * 60)}`;
  setPrompter(false); resetPrompter(); $('prompterPlay').disabled = !words; saveDraft();
}
$('script').addEventListener('input', () => {updateScript();libraryUI?.scheduleSave();}); updateScript();
$('speed').oninput = () => { $('speedValue').value = $('speed').value + ' px/s'; saveDraft(); }; $('speed').oninput();
$('fontSize').onchange = () => { $('prompterText').style.fontSize = `${$('fontSize').value}px`; saveDraft(); }; $('fontSize').onchange();
$('sync').onchange = () => {if ($('sync').checked && recording !== 'idle') setPrompter(recording === 'recording'); syncControls(); saveDraft();};
$('prompterPlay').onclick = () => {
  if ($('sync').checked && recording !== 'idle') {notice('Der Teleprompter folgt der Aufnahme. Zum freien Ablesen die Kopplung ausschalten.'); return;}
  if (!prompterRunning && $('prompterViewport').scrollTop >= $('prompterViewport').scrollHeight - $('prompterViewport').clientHeight - 2) resetPrompter();
  setPrompter(!prompterRunning);
};
$('reset').onclick = resetPrompter;
$('prompterViewport').addEventListener('scroll', () => {if (Math.abs($('prompterViewport').scrollTop - lastAppliedScroll) > 1) scrollPosition = $('prompterViewport').scrollTop;});
function setScriptMode(enabled) {
  scriptVisible = enabled; $('scriptEnabled').setAttribute('aria-pressed',String(enabled)); $('scriptEnabled').classList.toggle('primary',enabled); $('scriptEnabled').classList.toggle('secondary',!enabled); $('recordWorkspace').classList.toggle('script-mode', enabled);
  $('reader').hidden = !enabled; $('wavePanel').hidden = enabled;
  if(!enabled) setPrompter(false); else if(recording === 'recording' && $('sync').checked) setPrompter(true);
  resizeReader(); saveDraft();
}
function resizeReader() { const v=$('prompterViewport');v.style.setProperty('--reader-lead', `${v.clientHeight*.27}px`);v.style.setProperty('--reader-tail',`${v.clientHeight*.85}px`); }
new ResizeObserver(resizeReader).observe($('prompterViewport'));
$('scriptEnabled').onclick = () => setScriptMode(!scriptVisible);
$('useScript').onclick = () => {showView('record');setScriptMode(true);};
$('writeScript').onclick = () => showView('script');
$('import').onclick = guarded(async () => {
  const result = await api.importText(); if (!result) return;
  // Preserve an existing draft by appending imported text rather than replacing it.
  $('script').value = [$('script').value.trim(), cleanScript(result.text, result.name).trim()].filter(Boolean).join('\n\n');
  updateScript(); libraryUI?.scheduleSave(); notice(`${result.name} wurde zum Skript hinzugefügt.`);
});
function syncControls() {
  document.body.dataset.recording = recording;
  $('recordStatus').textContent = {idle: 'Bereit', recording: 'Aufnahme läuft', paused: 'Pausiert', stopping: 'Wird gespeichert'}[recording];
  $('record').disabled = busy || recording !== 'idle';
  $('pause').disabled = busy || !['recording','paused'].includes(recording);
  $('stop').disabled = busy || !['recording','paused'].includes(recording);
  $('pause').setAttribute('aria-label', recording === 'paused' ? 'Aufnahme fortsetzen' : 'Aufnahme pausieren');
  $('pause').title = recording === 'paused' ? 'Aufnahme fortsetzen (Leertaste)' : 'Pause (Leertaste)';
  $('pause').innerHTML = recording === 'paused' ? '<i class="icon" data-icon="media-play"></i><span>Weiter</span>' : '<i class="icon" data-icon="media-pause"></i><span>Pause</span>'; icons($('pause'));
  $('microphone').disabled = busy || recording !== 'idle'; $('connectMic').disabled = busy || recording !== 'idle';
  $('script').disabled = recording !== 'idle'; $('import').disabled = recording !== 'idle';
  updateLibraryState();
  libraryUI?.sync(busy || recording !== 'idle');
  $('scriptNav').disabled = busy || recording !== 'idle';
  $('previewPanel').hidden = !selectedTake || recording !== 'idle';
  $('waveEmpty').hidden = !!micStream || !!selectedTake;
  $('prompterPlay').disabled = !$('script').value.trim() || ($('sync').checked && recording !== 'idle');
  for (const id of ['previewPlay','previewBack','previewForward','previewSeek','previewExport','previewEdit']) $(id).disabled = busy || recording !== 'idle' || !selectedTake || player.readyState < 1;

  document.body.dataset.preview = String(!!selectedTake);
  $('waveStart').textContent = recording === 'idle' && selectedTake ? '00:00' : 'Eingangssignal';
  $('waveEnd').textContent = recording === 'paused' ? 'Pausiert · Mono' : recording === 'idle' && selectedTake ? timeLabel(selectedTake.duration) : 'Live · Mono';
  $('wavePaused').hidden = recording !== 'paused';
  if(recording === 'paused') $('inputState').textContent = 'Aufnahme pausiert';
  $('waveMode').textContent = recording === 'paused' ? 'Aufnahme pausiert' : recording !== 'idle' ? 'Live-Aufnahme' : selectedTake ? 'Audio-Vorschau' : 'Mikrofoneingang';
  $('waveHint').textContent = recording === 'paused' ? 'Wellenform und Aufnahme sind angehalten.' : recording !== 'idle' ? 'Echte Signalpegel · letzte 10 Sekunden' : selectedTake ? 'In die Wellenform klicken, um zu einer Stelle zu springen.' : 'Mikrofon aktivieren und Eingangspegel prüfen.';
  $('saveState').textContent = recording === 'paused' ? 'Pausiert · Es wird kein Audio aufgezeichnet' : recording === 'idle' ? 'Takes werden automatisch gespeichert' : 'Aufnahme wird laufend lokal gesichert';
}
async function refreshDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
  const value = chooseInput(inputs, preferredInput);
  $('microphone').replaceChildren();
  inputs.forEach((d,i) => $('microphone').add(new Option(d.label || (d.deviceId === 'default' ? 'Systemstandard' : `Mikrofon ${i+1}`),d.deviceId)));
  if(!inputs.length) $('microphone').add(new Option('Mikrofonzugriff aktivieren', ''));
  $('microphone').value = value;
  return value;
}
function mediaError(e, kind) {
  if (e.name === 'NotAllowedError') return Error(`${kind}-Zugriff fehlt. Bitte in den Systemeinstellungen unter Datenschutz & Sicherheit den Zugriff für VOICE (im Entwicklungsmodus Electron) erlauben.`);
  if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return Error(`${kind} ist nicht verfügbar. Bitte ein anderes Gerät auswählen.`);
  if (e.name === 'NotReadableError') return Error(`${kind} kann nicht geöffnet werden. Möglicherweise wird es bereits von einer anderen App verwendet.`);
  return e;
}
async function closeMic() {
  micStream?.getTracks().forEach(t => t.stop()); micStream = null;
  if (audioContext) await audioContext.close(); audioContext = null; analyser = null; processor = null; source = null; zeroGain = null; $('meterFill').style.width='0%'; $('db').textContent='−∞ dB'; latestPeak=0;latestRms=0;liveHistory=[];connectedAt=0;lastLevelAt=0;lastAudibleAt=0;
}
function sendCommand(type) {
  return new Promise((resolve, reject) => {
    const token = ++ackId; const timeout = setTimeout(() => {acknowledgements.delete(token); reject(Error('Das Audiogerät reagiert nicht mehr. Bereits geschriebene Audiodaten bleiben erhalten.'));}, 4000);
    acknowledgements.set(token, () => {clearTimeout(timeout); resolve();}); processor.port.postMessage({type, token});
  });
}
async function connectMic() {
  await closeMic();
  try {
    if (!await api.devices('microphone')) throw Object.assign(Error(), {name:'NotAllowedError'});
    await refreshDevices();
    const chosen = $('microphone').value;
    const label=$('microphone').selectedOptions[0]?.textContent || '';
    const status=await api.inputStatus();
    if(status.lidClosed && /MacBook|Built.in|integriert/i.test(label)) throw Error('Dein MacBook ist zugeklappt. Das eingebaute Mikrofon ist dadurch abgeschaltet. Öffne den Deckel oder wähle ein externes Mikrofon.');
    micStream = await navigator.mediaDevices.getUserMedia({audio: {deviceId: $('microphone').value ? {exact: $('microphone').value} : undefined, channelCount: {ideal:1}, echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
    audioContext = new AudioContext(); await audioContext.resume();
    await audioContext.audioWorklet.addModule('js/pcm-worklet.js');
    source = audioContext.createMediaStreamSource(micStream); analyser = audioContext.createAnalyser(); analyser.fftSize = 2048;
    processor = new AudioWorkletNode(audioContext, 'pcm-recorder'); zeroGain = audioContext.createGain(); zeroGain.gain.value = 0;
    source.connect(analyser); analyser.connect(processor); processor.connect(zeroGain); zeroGain.connect(audioContext.destination);
    processor.port.onmessage = ({data}) => {
      if(data.type === 'level') {
        lastLevelAt = performance.now();
        if(recording === 'paused' || recording === 'stopping') return;
        latestPeak = data.peak; latestRms = data.rms;
        liveHistory.push(data.peak); if(liveHistory.length > Math.ceil(audioContext.sampleRate / 512 * 10)) liveHistory.shift();
        if(data.peak > 0.0001) {lastAudibleAt=lastLevelAt;silenceWarned=false;}
        return;
      }
      if (data.type === 'ack') { acknowledgements.get(data.token)?.(); acknowledgements.delete(data.token); return; }
      if (data.type !== 'pcm' || !takeId) return;
      const id = takeId; const bytes = new Uint8Array(data.buffer); recordedSamples += bytes.length / 2; updateTimer(); pendingSamples += bytes.length / 2;
      if (pendingSamples > audioContext.sampleRate * 10 && !writeError) {writeError = Error('Die Festplatte schreibt zu langsam. Die Aufnahme wird beendet.'); void stopRecording();}
      writeQueue = writeQueue.then(async () => {await api.append(id, bytes);}).catch(e => {if (!writeError) {writeError = e; if (recording !== 'stopping') void stopRecording();}}).finally(() => {pendingSamples -= bytes.length / 2;});
    };
    processor.onprocessorerror = () => {notice('Die Audioverarbeitung wurde unterbrochen.', true); if (takeId) void stopRecording();};
    for (const track of micStream.getTracks()) track.onended = () => {notice('Das Mikrofon wurde getrennt. Der bisherige Take wird gespeichert.', true); if (takeId) void stopRecording(); $('inputState').textContent = 'Mikrofon getrennt';};
    connectedAt = performance.now(); silenceWarned=false; preferredInput=chosen; saveDraft();
    if (selectedTake) clearPreview();
    $('inputState').textContent = 'Warte auf Eingangssignal …'; $('inputState').title = micStream.getAudioTracks()[0].label; $('connectMic').textContent = 'Neu verbinden';
    $('format').textContent = `WAV · ${audioContext.sampleRate / 1000} kHz · Mono · 16 Bit`;
    await refreshDevices();
    const deadline=performance.now()+3000;
    while(!lastLevelAt && performance.now()<deadline) await new Promise(r=>setTimeout(r,40));
    if(!lastLevelAt) throw Error('Das Audiogerät liefert keine Daten. Bitte ein anderes Mikrofon auswählen und erneut verbinden.');
  } catch(e) {await closeMic(); $('inputState').textContent = 'Kein Mikrofon verbunden'; throw mediaError(e, 'Mikrofon');}
}
$('connectMic').onclick = guarded(async () => {busy = true; syncControls(); try {await connectMic();} finally {busy = false; syncControls();}});
$('microphone').onchange = guarded(async () => {preferredInput=$('microphone').value;saveDraft();await $('connectMic').onclick();});
async function startRecording() {
  if (busy || recording !== 'idle') return;
  player.pause();
  showView('record');
  busy = true; syncControls();
  try {
    if (!micStream?.getAudioTracks().some(t => t.readyState === 'live')) await connectMic();
    await audioContext.resume();
    await libraryUI?.flush();
    const result = await api.start(audioContext.sampleRate); takeId = result.id; recordedSamples = 0; pendingSamples = 0; writeQueue = Promise.resolve(); writeError = null;
    await sendCommand('record'); recording = 'recording'; liveHistory = [];
    $('notice').hidden = true;
    if ($('sync').checked) {resetPrompter(); setPrompter(true);}
  } catch(e) {if(takeId) {await api.finish(takeId).catch(()=>{});takeId=null;}recording='idle';throw e;} finally {busy = false; syncControls();}
}
async function pauseRecording() {
  if (busy || !['recording','paused'].includes(recording)) return;
  busy = true; syncControls();
  try {
    if (recording === 'recording') {recording = 'paused'; if ($('sync').checked) setPrompter(false); syncControls(); await sendCommand('pause');}
    else {await audioContext.resume(); await sendCommand('record'); recording = 'recording'; if ($('sync').checked) setPrompter(true);}
  } catch(e) {writeError = e; await stopRecording(); throw e;} finally {busy = false; syncControls();}
}
async function stopRecording() {
  if (!takeId || recording === 'stopping') return;
  busy = true; recording = 'stopping'; syncControls(); if ($('sync').checked) setPrompter(false);
  try {
    try {await sendCommand('stop');} catch(e) {writeError ||= e;}
    await writeQueue;
    const finishedId = takeId; await api.finish(takeId); takeId = null;
    await libraryUI?.associate(finishedId);
    notice(writeError ? `Aufnahme beendet: ${writeError.message} Der gespeicherte Teil steht unter „Meine Takes“ bereit.` : 'Take gespeichert. Du kannst ihn direkt in der Vorschau anhören oder als WAV exportieren.', !!writeError);
    const takes = await loadTakes();
    await selectTake(takes.find(t => t.id === finishedId));
  } catch(e) {fail(e); takeId = null; notice('Die Aufnahme konnte nicht vollständig abgeschlossen werden. Bereits geschriebene Daten werden beim nächsten Start wiederhergestellt. ' + e.message, true);}
  finally {recording = 'idle'; busy = false; syncControls();}
}
$('record').onclick = guarded(startRecording); $('pause').onclick = guarded(pauseRecording); $('stop').onclick = guarded(stopRecording);
function showView(view) {
  const script = view === 'script';
  if(script && recording !== 'idle') return;
  $('recordPage').hidden = script; $('scriptPage').hidden = !script;
  for (const [id,active] of [['studioNav',!script],['scriptNav',script]]) {
    $(id).classList.toggle('active',active); if(active) $(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
  }
  if(script) setPrompter(false); else resizeReader();
}
function takeName(take) { if(take.name)return take.name; return `${take.kind === 'cleaned' ? 'Bereinigt' : 'Take'} · ${new Date(take.created).toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`; }
function clearPreview() {
  previewGeneration++; player.pause(); player.removeAttribute('src'); player.load(); selectedTake = null; previewPeaks = [];
  $('previewName').textContent = 'Audio-Vorschau'; $('previewInfo').textContent = 'Nach der Aufnahme kannst du deinen Take hier anhören.'; syncControls();
}
async function selectTake(take, play = false) {
  if (!take) {clearPreview(); return;}
  const generation = ++previewGeneration; player.pause(); selectedTake = take; previewPeaks = [];
  $('previewName').textContent = takeName(take); $('previewInfo').textContent = 'Wellenform wird geladen …';
  player.src = `voice://take/${take.id}`; player.load(); syncControls();
  const waveform = await api.waveform(take.id); if(generation !== previewGeneration) return;
  previewPeaks = waveform.peaks;
  $('previewInfo').textContent = `${timeLabel(waveform.duration)} · ${take.rate / 1000} kHz · WAV · Mono`;
  $('waveEnd').textContent = timeLabel(waveform.duration);
  document.querySelectorAll('.take-row').forEach(row => row.classList.toggle('selected', row.dataset.id === take.id));
  syncControls();document.querySelector('.take-row.selected')?.scrollIntoView({block:'nearest'}); if(play && recording === 'idle') await player.play();
}
function previewUI() {
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  $('previewSeek').value = duration ? Math.round(player.currentTime / duration * 1000) : 0;
  $('previewPosition').textContent = `${timeLabel(player.currentTime)} / ${timeLabel(duration)}`;
  $('previewPlay').innerHTML = player.paused ? '<i class="icon" data-icon="media-play"></i><span>Abspielen</span>' : '<i class="icon" data-icon="media-pause"></i><span>Pause</span>'; icons($('previewPlay'));
}
for (const event of ['loadedmetadata','durationchange','play','pause','timeupdate','ended','emptied']) player.addEventListener(event, () => {previewUI(); syncControls();});
player.addEventListener('error', () => {if(selectedTake && player.hasAttribute('src')) notice('Diese Aufnahme kann nicht abgespielt werden. Bitte den Take erneut auswählen.', true);});
$('previewPlay').onclick = guarded(async () => {if(player.paused) {if(player.ended) player.currentTime = 0; await player.play();} else player.pause();});
function seek(time) {if(selectedTake && recording === 'idle' && Number.isFinite(player.duration)) {player.currentTime = Math.min(player.duration, Math.max(0,time)); previewUI();}}
$('previewBack').onclick = () => seek(player.currentTime - 5);
$('previewForward').onclick = () => seek(player.currentTime + 5);
$('previewSeek').oninput = () => seek(Number($('previewSeek').value) / 1000 * player.duration);
$('volume').oninput = () => player.volume = Number($('volume').value);
$('wave').onclick = event => {const r = $('wave').getBoundingClientRect();seek((event.clientX - r.left) / r.width * player.duration);};
$('previewExport').onclick = guarded(async () => {if(selectedTake && await api.export(selectedTake.id)) notice('WAV-Datei exportiert.');});
function updateLibraryState(){
 const locked=recording!=='idle' || busy;
 $('libraryActions').hidden=!selectedTake;
 $('librarySelection').textContent=selectedTake?takeName(selectedTake):'';
 $('libraryHint').textContent=recording!=='idle'?'Aufnahme aktiv · Takes geschützt':busy?'Bitte kurz warten …':'Alles lokal gespeichert';
 for(const id of ['libraryEdit','libraryExport','libraryDelete','libraryDetails','libraryTranscribe'])$(id).disabled=locked || !selectedTake;
 $('libraryEdit').disabled ||= !previewPeaks.length;
 $('refreshTakes').disabled=locked;
 for(const row of $('takes').querySelectorAll('.take-row')){
  const selected=row.dataset.id===selectedTake?.id,playing=selected&&!player.paused;
  row.classList.toggle('selected',selected);
  const select=row.querySelector('.take-select'),play=row.querySelector('.take-preview');
  select.setAttribute('aria-pressed',String(selected));select.disabled=locked;play.disabled=locked;
  for(const control of row.querySelectorAll('.take-rename,.take-name-form input,.take-name-form button'))control.disabled=locked;
  play.setAttribute('aria-label',playing?'Take pausieren':'Take anhören');
  const icon=play.querySelector('.icon'),name=playing?'media-pause':'media-play';
  if(icon.dataset.icon!==name){icon.dataset.icon=name;icons(play);}
 }
}
async function openLibraryTake(take,play=false){
 if(recording!=='idle' || busy)return;
 showView('record');setScriptMode(false);
 if(selectedTake?.id===take.id && play){if(player.paused)await player.play();else player.pause();}
 else await selectTake(take,play);
}
async function loadTakes() {
 cachedTakes=await api.list();if(selectedTake){selectedTake=cachedTakes.find(t=>t.id===selectedTake.id)||null;if(selectedTake)$('previewName').textContent=takeName(selectedTake);}
 renderTakes();return cachedTakes;
}
let cancelTakeRename=null;
function beginTakeRename(take,row){
 if(busy||recording!=='idle')return;
 cancelTakeRename?.();
 const select=row.querySelector('.take-select'),actions=row.querySelector('.take-row-actions');
 const form=document.createElement('form');form.className='take-name-form';form.noValidate=true;
 const label=document.createElement('label');label.textContent='Take benennen';
 const input=document.createElement('input');input.type='text';input.maxLength=160;input.value=takeName(take);input.autocomplete='off';input.id='take-name-'+take.id;label.htmlFor=input.id;
 const buttons=document.createElement('div');buttons.className='take-name-actions';
 const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Speichern';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Abbrechen';
 const error=document.createElement('p');error.className='take-name-error';error.setAttribute('role','alert');error.hidden=true;
 buttons.append(save,cancel);form.append(label,input,buttons,error);select.hidden=true;actions.hidden=true;row.append(form);
 const restore=()=>{form.remove();select.hidden=false;actions.hidden=false;cancelTakeRename=null;row.querySelector('.take-rename').focus();};
 cancelTakeRename=restore;cancel.onclick=()=>{if(!busy)restore();};
 form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===input&&!e.isComposing){e.preventDefault();e.stopPropagation();form.requestSubmit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)restore();}});
 input.oninput=()=>{error.hidden=true;input.removeAttribute('aria-invalid');};
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||recording!=='idle')return;const name=input.value.trim();
  if(!name){error.textContent='Bitte einen Namen eingeben.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
  busy=true;syncControls();
  try{await api.updateTake(take.id,{name});await loadTakes();$('takes').querySelector(`[data-id="${take.id}"] .take-rename`)?.focus();notice('Take umbenannt.');}
  catch(e){error.textContent=e.message||'Name konnte nicht gespeichert werden.';error.hidden=false;}
  finally{busy=false;syncControls();}
 };
 input.focus();input.select();
}
function renderTakes(){
 cancelTakeRename=null;
 const takes=libraryUI?libraryUI.filter(cachedTakes):cachedTakes;$('takeCount').textContent=takes.length;$('takes').replaceChildren();
 if(!takes.length){$('takes').innerHTML='<div class="takes-empty"><i class="icon" data-icon="file-audio"></i><div><strong>Platz für deine Stimme</strong><p>Deine Aufnahmen erscheinen nach dem Stoppen automatisch hier.</p></div></div>';}
 for(const take of takes){
  const row=document.createElement('div');row.className='take-row';row.dataset.id=take.id;
  const select=document.createElement('button');select.className='take-select';select.title=takeName(take);select.setAttribute('aria-label',`${takeName(take)} auswählen`);
  const name=document.createElement('strong');name.textContent=(take.favorite?'★ ':'')+takeName(take);
  const meta=document.createElement('span');meta.className='take-meta';
  const date=document.createElement('time');date.textContent=`${new Date(take.created).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} · ${timeLabel(take.duration)}`;
  const kind=document.createElement('span');kind.className='take-kind'+(['cleaned','edited'].includes(take.kind)?' cleaned':'');kind.textContent=({cleaned:'Bereinigt',edited:'Bearbeitet',imported:'Import'})[take.kind]||'Original';
  meta.append(date,kind);select.append(name,meta);select.onclick=guarded(()=>openLibraryTake(take));
  const play=document.createElement('button');play.className='take-preview';play.innerHTML='<i class="icon" data-icon="media-play"></i>';play.title='Anhören / pausieren';play.onclick=guarded(()=>openLibraryTake(take,true));
  const rename=document.createElement('button');rename.className='take-rename';rename.title='Take umbenennen';rename.setAttribute('aria-label',`${takeName(take)} umbenennen`);rename.innerHTML='<i class="icon" data-icon="action-edit"></i>';rename.onclick=()=>beginTakeRename(take,row);
  const actions=document.createElement('div');actions.className='take-row-actions';actions.append(play,rename);
  row.append(select,actions);$('takes').append(row);
 }
 icons($('takes'));updateLibraryState();return takes;
}
$('openFolder').onclick=guarded(async()=>{const error=await api.openFolder();if(error)throw Error(error);});
$('refreshTakes').onclick=guarded(loadTakes);
$('libraryEdit').onclick=guarded(openEditor);
$('libraryExport').onclick=guarded(async()=>{if(!busy && recording==='idle' && selectedTake && await api.export(selectedTake.id))notice('WAV-Datei exportiert.');});
$('libraryDelete').onclick=guarded(async()=>{
 if(busy || recording!=='idle' || !selectedTake)return;
 const id=selectedTake.id;
 if(await api.remove(id)){if(selectedTake?.id===id)clearPreview();await loadTakes();}
});
$('studioNav').onclick = () => {showView('record');};
$('scriptNav').onclick = () => showView('script');

const studioEditor=createEditor({api,$,icons,timeLabel,takeName,drawWave,onSaved:async id=>{const takes=await loadTakes();await selectTake(takes.find(t=>t.id===id));}});
async function openEditor(){if(!selectedTake||recording!=='idle'||busy)return;player.pause();await studioEditor.open(selectedTake);}
$('previewEdit').onclick=guarded(openEditor);
libraryUI=createLibraryUI({api,$,notice,fail,guarded,saved,updateScript,saveDraft,loadTakes,renderTakes,takeName,selected:()=>selectedTake,setBusy:value=>{busy=value;syncControls();},selectTake,allowed:()=>!busy&&recording==='idle'});

const transcriptionUI=createTranscriptionUI({api,$,takeName,setBusy:value=>{busy=value;syncControls();},onScript:async id=>{await libraryUI.flush();const script=await api.transcriptionScript(id);await libraryUI.openScript(script.id);showView('script');notice('Transkript als neues Script gespeichert.');}});
$('libraryTranscribe').onclick=guarded(async()=>{if(!selectedTake||busy||recording!=='idle')return;player.pause();await transcriptionUI.open(selectedTake);});

window.addEventListener('keydown', guarded(async e => {
  if(document.querySelector('dialog[open]'))return;
  if (e.code === 'Escape') {if (takeId && !busy) await stopRecording();  return;}
  if($('recordPage').hidden || $('editDialog').open) return;
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
  e.preventDefault(); if (recording === 'idle') await startRecording(); else await pauseRecording();
}));
function updateTimer() {
 const recorded=audioContext ? recordedSamples/audioContext.sampleRate : 0;
 const seconds=recording==='idle' && selectedTake ? player.currentTime : recorded;
 $('timer').innerHTML=`${timeLabel(seconds)}<span>.${Math.floor(seconds*10)%10}</span>`;
}
function drawWave(canvas, peaks, progress = null) {
 const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 const ratio=devicePixelRatio||1;
 if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
 const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const css=getComputedStyle(document.documentElement),color=css.getPropertyValue('--color-accent').trim();
 ctx.strokeStyle=css.getPropertyValue('--color-border').trim();ctx.globalAlpha=.35;ctx.lineWidth=1;
 for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);ctx.stroke();}
 for(let i=1;i<10;i++){ctx.beginPath();ctx.moveTo(w*i/10,0);ctx.lineTo(w*i/10,h);ctx.stroke();}
 ctx.globalAlpha=1;
 const live=progress===null && canvas.id!=='editWave';
 const capacity=live?Math.ceil((audioContext?.sampleRate || 48000)/512*10):Math.max(1,peaks.length);
 const bins=Math.max(1,Math.ceil(w/1.5)),heights=[];
 for(let i=0;i<=bins;i++){
  const pos=i/bins*capacity-(live?capacity-peaks.length:0);
  const span=capacity/bins;let peak=0;
  if(span>1){for(let j=Math.max(0,Math.floor(pos));j<Math.min(peaks.length,Math.ceil(pos+span));j++)peak=Math.max(peak,peaks[j]||0);}
  else {const j=Math.floor(pos),f=pos-j;peak=(peaks[j]||0)*(1-f)+(peaks[j+1]||0)*f;}
  heights.push(Math.max(.5,Math.sqrt(peak)*Math.max(1,h-28)/2));
 }
 ctx.fillStyle=color;ctx.beginPath();
 for(let i=0;i<=bins;i++){const x=i/bins*w,y=h/2-heights[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
 for(let i=bins;i>=0;i--)ctx.lineTo(i/bins*w,h/2+heights[i]);ctx.closePath();ctx.fill();
 if(progress!==null){ctx.fillStyle=css.getPropertyValue('--color-background').trim();ctx.globalAlpha=.45;ctx.fillRect(progress*w,0,w*(1-progress),h);}
 ctx.globalAlpha=1;
 if(progress!==null){ctx.fillStyle=css.getPropertyValue('--color-text').trim();ctx.fillRect(progress*w,0,1,h);}
 canvas.dataset.nonzero=String(peaks.some(p=>p>0));
}
function frame(now){
 const delta=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
 if(prompterRunning && !$('recordPage').hidden && $('prompterViewport').clientHeight>0){
  const v=$('prompterViewport');scrollPosition+=Number($('speed').value)*delta;v.scrollTop=scrollPosition;lastAppliedScroll=v.scrollTop;
  if(v.scrollTop>=v.scrollHeight-v.clientHeight-1){setPrompter(false);$('prompterStatus').textContent='Textende';}
 }
 updateTimer();
 if(micStream && recording !== 'paused' && recording !== 'stopping'){
  const db=latestRms>0?20*Math.log10(latestRms):-Infinity;
  $('db').textContent=latestPeak>.98?'Clip':db>-90?`${Math.round(db)} dB`:'−∞ dB';
  $('meterFill').style.width=`${Math.max(0,Math.min(100,(db+60)/60*100))}%`;
  $('meterFill').style.background=latestPeak>.98?'var(--color-danger)':'var(--color-success)';
  const noSignal=connectedAt && now-connectedAt>3000 && (!lastAudibleAt || now-lastAudibleAt>3000);
  $('inputState').textContent=noSignal?'Kein Signal – Eingang prüfen':latestPeak>.98?'Pegel zu hoch':latestPeak>.0001?'Signal erkannt':'Mikrofon verbunden';
  $('inputState').style.color=noSignal?'var(--color-warning)':'';
  if(noSignal && !silenceWarned){silenceWarned=true;
    notice('Das gewählte Mikrofon liefert gerade Stille. Prüfe die Geräteauswahl, die Stummschaltung und den Eingangspegel.',true);
    const label=micStream.getAudioTracks()[0]?.label || '';
    if(/MacBook|Built.in|integriert/i.test(label)) void api.inputStatus().then(s=>{if(s.lidClosed) notice('Dein MacBook ist zugeklappt. Öffne den Deckel oder wähle ein externes Mikrofon; das eingebaute Mikrofon ist abgeschaltet.',true);}).catch(()=>{});
  }
  if(lastLevelAt && now-lastLevelAt>4000 && recording==='recording'){writeError=Error('Der Audiostream wurde unterbrochen.');void stopRecording();}
 }
 const preview=selectedTake && recording==='idle';
 const peaks=preview?previewPeaks:liveHistory;
 drawWave($('wave'),peaks,preview&&player.duration?player.currentTime/player.duration:null);
 drawWave($('miniWave'),liveHistory);
 studioEditor.draw();
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);setScriptMode(scriptVisible);syncControls();
navigator.mediaDevices?.addEventListener('devicechange',guarded(refreshDevices));
void guarded(refreshDevices)();void guarded(async()=>{
  await libraryUI.init(); await loadTakes();
  let coreProject=null;
  async function openCoreProject(context){
    if(recording!=='idle'||busy||document.querySelector('dialog[open]:not(.brink-core-panel)'))return {ok:false,code:'busy'};
    await libraryUI.flush();const result=await window.brinkCore.open(context);coreProject=result;
    await libraryUI.openScript(result.scriptId);
    if(result.importJob){busy=true;syncControls();try{for(;;){const job=await api.jobStatus(result.importJob.jobId);if(job.state==='done'){await libraryUI.associate(job.result.id);result.nativeId=job.result.id;break;}if(['error','cancelled'].includes(job.state))throw Error(job.error||'Import abgebrochen.');await new Promise(resolve=>setTimeout(resolve,150));}}finally{busy=false;syncControls();}}
    const takes=await loadTakes();if(result.nativeId){const take=takes.find(t=>t.id===result.nativeId);if(!take)throw Error('Die verknüpfte Aufnahme ist nicht mehr vorhanden.');await selectTake(take);showView('record');}else showView('script');
    notice('BRINK-Projekt verbunden. Die Aufnahme startest du selbst.');return {ok:true};
  }
  window.BrinkCorePanel?.mount({host:'.navigation',tool:()=> 'voice',accepts:asset=>asset.kind==='audio',open:openCoreProject,
    publishLabel:'Ausgewählten Take hinzufügen',
    async publish(id){if(!selectedTake||recording!=='idle'||busy)throw Error('Bitte einen fertigen Take auswählen.');const result=await window.brinkCore.publish('voice',id,{nativeId:selectedTake.id});await window.brinkCore.attach('voice',id,selectedTake.id);return result;},
    async script(id){if(coreProject?.projectId!==id)throw Error('Öffne zunächst das Script dieses BRINK-Projekts.');await libraryUI.flush();const result=await window.brinkCore.saveScript(id,$('script').value,coreProject.scriptRevision);coreProject.scriptRevision=result.revision;}
  });
  window.brinkSuite?.onLaunch(async context => {
    const {intent}=context;
    if(context.projectId)return openCoreProject(context);
    if (intent === 'create') {
      if (recording !== 'idle' || busy || document.querySelector('dialog[open]')) return { ok: false, code: 'busy' };
      showView('record');
      clearPreview();
      notice('Bereit für eine neue Aufnahme. Mikrofon und Aufnahme startest du selbst.');
    }
    return { ok: true };
  });
})();
