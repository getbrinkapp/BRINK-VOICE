const {app,dialog,systemPreferences,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {header}=require('../electron/recordings.cjs');
app.disableHardwareAcceleration();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'voice-v04-'));
app.setPath('appData',temp);app.setPath('userData',path.join(temp,'VOICE'));
const input=path.join(temp,'known-tone.wav'),pcm=Buffer.alloc(48000*6*2);
for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(i/48000*Math.PI*880)*(.12+.08*Math.sin(i/48000*3))*32767),i*2);
fs.writeFileSync(input,Buffer.concat([header(pcm.length,48000),pcm]));
app.commandLine.appendSwitch('use-fake-device-for-media-stream');app.commandLine.appendSwitch('use-fake-ui-for-media-stream');app.commandLine.appendSwitch('use-file-for-fake-audio-capture',input);
// Test-only: Chromium's sandboxed audio service cannot read our temporary WAV fixture on macOS.
// The shipped app retains its normal audio-service and renderer sandboxes.
app.commandLine.appendSwitch('disable-features','AudioServiceSandbox');
systemPreferences.askForMediaAccess=async k=>k==='microphone';
const imported=path.join(temp,'script.srt'),exported=path.join(temp,'export.wav');fs.writeFileSync(imported,'1\n00:00:00,000 --> 00:00:05,000\nHallo BRINK. Dieser Text wird vorgelesen.');
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[imported]});dialog.showSaveDialog=async()=>({canceled:false,filePath:exported});let deletion=0;dialog.showMessageBox=async()=>({response:deletion});
const errors=[],deadline=setTimeout(()=>{console.error('Timeout',errors);app.exit(1);},95000);
app.on('web-contents-created',(_,wc)=>{wc.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});wc.once('did-finish-load',async()=>{
 const run=f=>wc.executeJavaScript(`(${f.toString()})()`);const wait=async(f,label)=>{for(let i=0;i<160;i++){if(await run(f))return;await new Promise(r=>setTimeout(r,50));}throw Error(label+': '+await run(()=>document.getElementById('noticeText').textContent));};
 const capture=async name=>{const dir=path.resolve(__dirname,'../work');fs.mkdirSync(dir,{recursive:true});wc.invalidate();await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(dir,name+'.png'),(await wc.capturePage()).toPNG());};
 const fit=async()=>assert.deepEqual(await run(()=>{const page=document.querySelector('.page:not([hidden])'),main=document.querySelector('main');return {page:page.scrollHeight<=page.clientHeight+1,main:main.scrollHeight<=main.clientHeight+1,body:document.documentElement.scrollHeight<=innerHeight,record:document.getElementById('recordPage').hidden||document.getElementById('stop').getBoundingClientRect().bottom<innerHeight,width:page.scrollWidth<=page.clientWidth};}),{page:true,main:true,body:true,record:true,width:true});
 try{
  await wait(()=>!!document.getElementById('record').onclick,'init');assert.equal(await run(()=>document.querySelectorAll('.navigation button').length),2);await fit();
  assert.equal(await run(()=>document.getElementById('scriptPage').hidden),true);assert.equal(await run(()=>document.querySelectorAll('video').length),0);
  await run(()=>document.getElementById('scriptNav').click());assert.equal(await run(()=>document.getElementById('recordPage').hidden),true);await fit();
  await run(()=>document.getElementById('import').click());await wait(()=>document.getElementById('script').value.includes('Hallo BRINK'),'import');
  await run(()=>{const e=document.getElementById('script');e.value+='\n\n'+Array(40).fill('Sprich in deinem Tempo. Deine Stimme erzählt die Geschichte.').join('\n\n');e.dispatchEvent(new Event('input'));});await capture('script');
  await run(()=>document.getElementById('useScript').click());assert.equal(await run(()=>document.getElementById('scriptPage').hidden),true);assert.equal(await run(()=>document.getElementById('reader').hidden),false);await fit();
  assert.ok(await run(()=>document.getElementById('reader').clientHeight > document.querySelector('.transport').clientHeight*2));
  await run(()=>document.getElementById('prompterPlay').click());await wait(()=>document.getElementById('prompterViewport').scrollTop>5,'text preview');await run(()=>{document.getElementById('prompterPlay').click();document.getElementById('reset').click();});
  await run(()=>document.getElementById('connectMic').click());await wait(()=>document.getElementById('inputState').textContent==='Signal erkannt','real sample signal');
  await wait(()=>document.getElementById('miniWave').dataset.nonzero==='true','mini waveform');
  await run(()=>document.getElementById('record').click());await wait(()=>document.body.dataset.recording==='recording','record');await wait(()=>document.getElementById('prompterViewport').scrollTop>5,'synced reader');await new Promise(r=>setTimeout(r,650));
  // The pause label changes synchronously, before the worklet acknowledgement.
  assert.equal(await run(()=>{document.getElementById('pause').click();return document.body.dataset.recording;}),'paused');
  await wait(()=>!document.getElementById('pause').disabled,'pause ack');
  const frozen=()=>({timer:document.getElementById('timer').textContent,scroll:document.getElementById('prompterViewport').scrollTop,wave:document.getElementById('miniWave').toDataURL()});
  await new Promise(r=>setTimeout(r,80));const paused=await run(frozen);await new Promise(r=>setTimeout(r,450));assert.deepEqual(await run(frozen),paused);
  await run(()=>document.getElementById('scriptEnabled').click());await new Promise(r=>setTimeout(r,100));
  const pausedMain=await run(()=>document.getElementById('wave').toDataURL());await new Promise(r=>setTimeout(r,450));assert.equal(await run(()=>document.getElementById('wave').toDataURL()),pausedMain);
  assert.equal(await run(()=>document.getElementById('wavePaused').hidden),false);await capture('wave-paused');
  await run(()=>document.getElementById('scriptEnabled').click());
  await run(()=>document.getElementById('pause').click());await wait(()=>document.body.dataset.recording==='recording','resume');await new Promise(r=>setTimeout(r,700));assert.notEqual(await run(()=>document.getElementById('miniWave').toDataURL()),paused.wave);await capture('record-script');await run(()=>document.getElementById('scriptEnabled').click());await new Promise(r=>setTimeout(r,800));await capture('wave-live');await run(()=>document.getElementById('scriptEnabled').click());
  await run(()=>document.getElementById('stop').click());await wait(()=>document.body.dataset.recording==='idle'&&!document.getElementById('previewPlay').disabled,'saved preview');
  const takes=await run(()=>window.voice.list());assert.equal(takes.length,1);const data=fs.readFileSync(path.join(temp,'VOICE','Recordings',takes[0].id+'.wav'));const rate=data.readUInt32LE(24);let sum=0,peak=0,crossings=0,last=0;for(let i=44;i<data.length;i+=2){const v=data.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(v));sum+=v*v;if(last<0&&v>=0)crossings++;last=v;}
  const seconds=(data.length-44)/2/rate,frequency=crossings/seconds,rms=Math.sqrt(sum/((data.length-44)/2));assert.ok(rms>.04&&peak>.1);assert.ok(Math.abs(frequency-440)<5,`Captured frequency ${frequency}`);assert.equal(data.readUInt32LE(40),data.length-44);
  await run(()=>{document.getElementById('scriptEnabled').click();document.getElementById('dismissNotice').click();});assert.equal(await run(()=>document.getElementById('reader').hidden),true);await wait(()=>document.getElementById('wave').dataset.nonzero==='true','saved waveform');await fit();
  const rendered=await run(()=>{const c=document.getElementById('wave'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>d[i]+40&&d[i+3]>100)count++;return count;});assert.ok(rendered>100,'Waveform actually painted');
  await run(()=>{document.getElementById('volume').value=0;document.getElementById('volume').dispatchEvent(new Event('input'));document.getElementById('previewPlay').click();});await wait(()=>document.getElementById('previewAudio').currentTime>.15,'playback');await run(()=>document.getElementById('previewPlay').click());
  await run(()=>{const e=document.getElementById('previewSeek');e.value=500;e.dispatchEvent(new Event('input'));});assert.ok(await run(()=>Math.abs(document.getElementById('previewAudio').currentTime/document.getElementById('previewAudio').duration-.5))<.05);
  await run(()=>document.getElementById('previewExport').click());await wait(()=>document.getElementById('noticeText').textContent.includes('exportiert'),'export');assert.deepEqual(fs.readFileSync(exported),data);
  await run(()=>document.getElementById('dismissNotice').click());await capture('record');
  const win=BrowserWindow.fromWebContents(wc);for(const [width,height] of [[1060,720],[1200,800]]){win.setSize(width,height);await new Promise(r=>setTimeout(r,120));await fit();await run(()=>document.getElementById('scriptEnabled').click());await fit();await run(()=>document.getElementById('scriptEnabled').click());}
  win.setSize(1060,720);await new Promise(r=>setTimeout(r,100));await capture('record-small');await run(()=>document.getElementById('scriptEnabled').click());await capture('reader-small');await fit();
  await run(()=>document.getElementById('scriptNav').click());await fit();await run(()=>{document.getElementById('theme').value='light';document.getElementById('theme').dispatchEvent(new Event('change'));});await capture('script-light');
  await run(()=>document.getElementById('studioNav').click());await run(()=>document.getElementById('takesNav').click());await wait(()=>document.getElementById('takesDialog').open,'takes dialog');await run(()=>document.querySelector('.take-preview').click());await wait(()=>!document.getElementById('previewAudio').paused,'take replay');assert.equal(await run(()=>document.getElementById('takesDialog').open),false);await run(()=>document.getElementById('previewAudio').pause());
  await run(()=>{document.getElementById('scriptEnabled').checked=false;document.getElementById('scriptEnabled').dispatchEvent(new Event('change'));});
  const fixture=Buffer.alloc(48000*4*2);for(let i=0;i<fixture.length/2;i++){const t=i/48000;const amp=(t>.5&&t<1.2)||(t>2.3&&t<3.5)?.14:0;fixture.writeInt16LE(Math.round(Math.sin(t*Math.PI*880)*amp*32767),i*2);}
  const editId=require('node:crypto').randomUUID(),editPath=path.join(temp,'VOICE','Recordings',editId+'.wav');fs.writeFileSync(editPath,Buffer.concat([header(fixture.length,48000),fixture]));
  const originalFile=fs.readFileSync(editPath);
  await run(()=>document.getElementById('takesNav').click());await wait(()=>document.querySelectorAll('.take-row').length===2,'editor source loaded');
  await wc.executeJavaScript(`document.querySelector('[data-id="${editId}"]').querySelectorAll('button')[1].click()`);
  await wait(()=>document.getElementById('editDialog').open&&!document.getElementById('applyCleanup').disabled,'silence analysis');
  assert.ok(await run(()=>document.getElementById('editSummary').textContent.includes('3 Lücken')));await capture('edit-analysis');
  assert.ok(await run(()=>{const d=document.getElementById('editDialog');return d.scrollHeight<=d.clientHeight+1&&d.getBoundingClientRect().bottom<=innerHeight;}),'Editor fits smallest supported window');
  await run(()=>document.getElementById('editPlay').click());await wait(()=>document.getElementById('editAudio').currentTime>.1,'original preview');await run(()=>document.getElementById('editPlay').click());
  await run(()=>document.getElementById('applyCleanup').click());await wait(()=>!document.getElementById('exportCleanup').hidden,'cleanup finished');
  const cleaned=(await run(()=>window.voice.list())).find(t=>t.kind==='cleaned');assert.ok(cleaned);assert.ok(cleaned.duration<2.2&&cleaned.duration>1.9);assert.deepEqual(fs.readFileSync(editPath),originalFile);
  await wait(()=>!document.getElementById('editPlay').disabled,'result metadata');await run(()=>document.getElementById('editPlay').click());await wait(()=>document.getElementById('editAudio').currentTime>.1,'cleaned preview');await run(()=>document.getElementById('editPlay').click());
  await run(()=>{document.getElementById('editSeek').value=500;document.getElementById('editSeek').dispatchEvent(new Event('input'));});assert.ok(await run(()=>Math.abs(document.getElementById('editAudio').currentTime/document.getElementById('editAudio').duration-.5))<.05);
  await run(()=>document.getElementById('editOriginal').click());assert.ok((await run(()=>document.getElementById('editAudio').src)).includes(editId));
  await run(()=>document.getElementById('editResult').click());assert.ok((await run(()=>document.getElementById('editAudio').src)).includes(cleaned.id));
  await run(()=>document.getElementById('exportCleanup').click());await wait(()=>document.getElementById('editSummary').textContent.includes('exportiert'),'cleaned export');assert.deepEqual(fs.readFileSync(exported),fs.readFileSync(path.join(temp,'VOICE','Recordings',cleaned.id+'.wav')));await capture('edit-result');
  await run(()=>document.getElementById('closeEdit').click());await fit();
  const draft=await run(()=>document.getElementById('script').value);wc.reload();await new Promise(r=>wc.once('did-finish-load',r));await wait(()=>!!document.getElementById('record').onclick,'reload');assert.equal(await run(()=>document.getElementById('script').value),draft);assert.equal((await run(()=>window.voice.list())).length,3);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,knownInput:{rms,peak,frequency,seconds,rate},waveformPixels:rendered,checks:['separate pages','no scroll 1060x720 / 1200x800','record script toggle','compact controls','input meter','live waveform','PCM tone fidelity','immediate pause and frozen full/mini waveform','resume waveform','silence analysis/cleanup','original unchanged','cleaned playback/seek/export','reader sync','preview playback/seek/export','take dialog','draft/take persistence'],artifacts:path.resolve(__dirname,'../work')}));clearTimeout(deadline);app.exit(0);
 }catch(e){console.error(e,errors);await capture('failure');clearTimeout(deadline);app.exit(1);}
 });});require('../electron/main.cjs');
