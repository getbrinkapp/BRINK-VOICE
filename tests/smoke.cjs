const {app,dialog,systemPreferences,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {header}=require('../electron/recordings.cjs');
app.disableHardwareAcceleration();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'voice-v05-'));
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
  await wait(()=>!!document.getElementById('record').onclick&&document.getElementById('scriptPicker').options.length>0,'init');assert.equal(await run(()=>document.querySelectorAll('.navigation button').length),3);assert.ok(await run(()=>[...document.querySelectorAll('.navigation button')].some(button=>button.textContent.includes('BRINK'))));await fit();
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
  assert.ok(await run(()=>document.querySelector('.take-library').getBoundingClientRect().left<300));
  await run(()=>document.querySelector('.take-preview').click());await wait(()=>!document.getElementById('previewAudio').paused,'sidebar take replay');assert.equal(await run(()=>document.getElementById('scriptPage').hidden),true);await run(()=>document.querySelector('.take-preview').click());assert.equal(await run(()=>document.getElementById('previewAudio').paused),true);
  await run(()=>document.getElementById('libraryEdit').click());await wait(()=>document.getElementById('editSummary').dataset.state==='empty','no gap status');assert.equal(await run(()=>document.getElementById('applyCleanup').disabled),true);await run(()=>document.getElementById('closeEdit').click());
  await run(()=>{if(document.getElementById('scriptEnabled').getAttribute('aria-pressed')==='true')document.getElementById('scriptEnabled').click();});
  const fixture=Buffer.alloc(48000*4*2);for(let i=0;i<fixture.length/2;i++){const t=i/48000;const amp=(t>.5&&t<1.2)||(t>2.3&&t<3.5)?.14:0;fixture.writeInt16LE(Math.round(Math.sin(t*Math.PI*880)*amp*32767),i*2);}
  const editId=require('node:crypto').randomUUID(),editPath=path.join(temp,'VOICE','Recordings',editId+'.wav');fs.writeFileSync(editPath,Buffer.concat([header(fixture.length,48000),fixture]));
  const originalFile=fs.readFileSync(editPath);
  await run(()=>document.getElementById('refreshTakes').click());await wait(()=>document.querySelectorAll('.take-row').length===2,'editor source loaded');
  await wc.executeJavaScript(`document.querySelector('[data-id="${editId}"] .take-select').click()`);await wait(()=>!document.getElementById('libraryEdit').disabled,'selected take ready');await run(()=>document.getElementById('libraryEdit').click());
  await wait(()=>document.getElementById('editDialog').open&&!document.getElementById('applyCleanup').disabled,'silence analysis');
  assert.ok(await run(()=>document.getElementById('editSummary').textContent.includes('3 Pausen')));await capture('edit-analysis');
  assert.ok(await run(()=>{const d=document.getElementById('editDialog');return d.scrollHeight<=d.clientHeight+1&&d.getBoundingClientRect().bottom<=innerHeight;}),'Editor fits smallest supported window');
  await run(()=>document.getElementById('editPlay').click());await wait(()=>document.getElementById('editAudio').currentTime>.1,'original preview');await run(()=>document.getElementById('editPlay').click());
  const readCuts=()=>[...document.querySelectorAll('.cut-region')].map(r=>[Number(r.dataset.start),Number(r.dataset.end)]);
  const autoCuts=await run(readCuts);assert.equal(autoCuts.length,3);
  const drag=async(part,pixels)=>{
   const point=await wc.executeJavaScript(`(()=>{const r=document.querySelectorAll('.cut-region')[1].querySelector('[data-part="${part}"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
   wc.sendInputEvent({type:'mouseMove',...point});wc.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
   wc.sendInputEvent({type:'mouseMove',x:point.x+pixels,y:point.y,button:'left'});
   wc.sendInputEvent({type:'mouseUp',x:point.x+pixels,y:point.y,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,80));
  };
  await drag('start',12);let moved=await run(readCuts);assert.ok(moved[1][0]>autoCuts[1][0]);assert.equal(moved[1][1],autoCuts[1][1]);
  await drag('end',-10);let resized=await run(readCuts);assert.equal(resized[1][0],moved[1][0]);assert.ok(resized[1][1]<moved[1][1]);
  await drag('move',8);let shifted=await run(readCuts);assert.ok(shifted[1][0]>resized[1][0]);assert.ok(Math.abs((shifted[1][1]-shifted[1][0])-(resized[1][1]-resized[1][0]))<1/48000);
  await run(()=>document.querySelectorAll('.cut-region')[1].querySelector('[data-part="start"]').focus());wc.sendInputEvent({type:'keyDown',keyCode:'Right'});wc.sendInputEvent({type:'keyUp',keyCode:'Right'});await new Promise(r=>setTimeout(r,80));
  assert.ok(Math.abs((await run(readCuts))[1][0]-shifted[1][0]-.01)<1/48000);
  const beforeLess=await run(readCuts);await run(()=>document.getElementById('cutLess').click());const afterLess=await run(readCuts);assert.ok(afterLess[1][0]>beforeLess[1][0] && afterLess[1][1]<beforeLess[1][1]);await run(()=>document.getElementById('cutMore').click());const afterMore=await run(readCuts);assert.ok(Math.abs(afterMore[1][0]-beforeLess[1][0])<1/48000);assert.ok(Math.abs(afterMore[1][1]-beforeLess[1][1])<1/48000);
  assert.equal(await run(()=>document.querySelectorAll('#cutControls input[type=number]').length),0);assert.match(await run(()=>document.getElementById('cutRange').textContent),/^\d{2}:\d{2},\d – \d{2}:\d{2},\d$/);
  await run(()=>document.getElementById('nextCut').click());assert.equal(await run(()=>document.getElementById('cutSelection').value),'2');await run(()=>document.getElementById('previousCut').click());assert.equal(await run(()=>document.getElementById('cutSelection').value),'1');
  await run(()=>document.getElementById('listenCut').click());await wait(()=>!document.getElementById('editAudio').paused,'audition selected pause');await wait(()=>document.getElementById('editAudio').paused,'audition stops after pause context');
  assert.equal(await run(()=>document.getElementById('editSummary').dataset.state),'modified');
  assert.ok(await run(()=>document.getElementById('editSummary').textContent.includes('Bearbeitung angepasst')));
  await capture('edit-adjusted');await run(()=>{document.getElementById('theme').value='dark';document.getElementById('theme').dispatchEvent(new Event('change'));});await capture('edit-adjusted-dark');
  await run(()=>document.getElementById('resetCuts').click());assert.deepEqual(await run(readCuts),autoCuts);
  // A shorter manually selected gap must propagate through the IPC into the WAV.
  await drag('start',14);const adjustedCuts=await run(readCuts);
  const expectedDuration=4-adjustedCuts.reduce((sum,[a,b])=>sum+b-a,0);
  assert.equal(await run(()=>{document.getElementById('applyCleanup').click();return document.getElementById('editSummary').dataset.state;}),'busy');await wait(()=>!document.getElementById('exportCleanup').hidden,'cleanup finished');
  assert.equal(await run(()=>document.getElementById('editSummary').dataset.state),'success');
  const cleaned=(await run(()=>window.voice.list())).find(t=>t.kind==='edited');assert.ok(cleaned);assert.ok(Math.abs(cleaned.duration-expectedDuration)<1/48000);assert.ok(cleaned.duration>4-autoCuts.reduce((sum,[a,b])=>sum+b-a,0));assert.deepEqual(fs.readFileSync(editPath),originalFile);
  await wait(()=>!document.getElementById('editPlay').disabled,'result metadata');await run(()=>document.getElementById('editPlay').click());await wait(()=>document.getElementById('editAudio').currentTime>.1,'cleaned preview');await run(()=>document.getElementById('editPlay').click());
  await run(()=>{document.getElementById('editSeek').value=500;document.getElementById('editSeek').dispatchEvent(new Event('input'));});assert.ok(await run(()=>Math.abs(document.getElementById('editAudio').currentTime/document.getElementById('editAudio').duration-.5))<.05);
  await run(()=>document.getElementById('editOriginal').click());assert.ok((await run(()=>document.getElementById('editAudio').src)).includes(editId));
  await run(()=>document.getElementById('editResult').click());assert.ok((await run(()=>document.getElementById('editAudio').src)).includes(cleaned.id));
  await run(()=>document.getElementById('exportCleanup').click());await wait(()=>document.getElementById('editSummary').textContent.includes('exportiert'),'cleaned export');assert.deepEqual(fs.readFileSync(exported),fs.readFileSync(path.join(temp,'VOICE','Recordings',cleaned.id+'.wav')));await capture('edit-result');
  await drag('end',-5);assert.equal(await run(()=>document.getElementById('exportCleanup').hidden),true);assert.equal(await run(()=>document.getElementById('applyCleanup').hidden),false);assert.ok((await run(()=>document.getElementById('editAudio').src)).includes(editId));
  await run(()=>document.getElementById('listenCut').click());await wait(()=>!document.getElementById('editAudio').paused,'audition before close');await run(()=>document.getElementById('closeEdit').click());assert.equal(await run(()=>document.getElementById('editAudio').paused),true);await fit();
  await capture('sidebar-takes');assert.equal(await run(()=>document.querySelectorAll('.take-kind.cleaned').length),1);
  await run(()=>document.getElementById('libraryExport').onclick());assert.ok(await run(()=>document.getElementById('noticeText').textContent.includes('exportiert')));assert.deepEqual(fs.readFileSync(exported),fs.readFileSync(path.join(temp,'VOICE','Recordings',cleaned.id+'.wav')));
  // A growing library scrolls internally while the recording page stays fixed.
  const extras=Array.from({length:12},()=>require('node:crypto').randomUUID());for(const id of extras)fs.writeFileSync(path.join(temp,'VOICE','Recordings',id+'.wav'),originalFile);
  await run(()=>document.getElementById('refreshTakes').click());await wait(()=>document.querySelectorAll('.take-row').length===15,'large library');await fit();assert.ok(await run(()=>document.getElementById('takes').scrollHeight>document.getElementById('takes').clientHeight));await capture('sidebar-many-takes');
  await wc.executeJavaScript(`document.querySelector('[data-id="${extras[0]}"] .take-select').click()`);await wait(()=>!document.getElementById('libraryEdit').disabled,'delete selection ready');
  deletion=0;await run(()=>document.getElementById('libraryDelete').click());await new Promise(r=>setTimeout(r,100));assert.equal((await run(()=>window.voice.list())).length,15);
  deletion=1;await run(()=>document.getElementById('libraryDelete').click());await wait(()=>document.querySelectorAll('.take-row').length===14,'delete selected take');assert.equal(await run(()=>document.getElementById('libraryActions').hidden),true);
  for(const id of extras.slice(1))fs.unlinkSync(path.join(temp,'VOICE','Recordings',id+'.wav'));await run(()=>document.getElementById('refreshTakes').click());await wait(()=>document.querySelectorAll('.take-row').length===3,'library refreshed');
  await run(()=>document.getElementById('record').click());await wait(()=>document.body.dataset.recording==='recording','second recording');assert.equal(await run(()=>[...document.querySelectorAll('.take-select,.take-preview')].every(b=>b.disabled)),true);await run(()=>document.getElementById('stop').click());await wait(()=>document.body.dataset.recording==='idle' && document.querySelectorAll('.take-row').length===4,'sidebar auto updates after recording');
  const draft=await run(()=>document.getElementById('script').value);wc.reload();await new Promise(r=>wc.once('did-finish-load',r));await wait(()=>!!document.getElementById('record').onclick&&document.getElementById('scriptPicker').options.length>0,'reload');assert.equal(await run(()=>document.getElementById('script').value),draft);assert.equal((await run(()=>window.voice.list())).length,4);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,knownInput:{rms,peak,frequency,seconds,rate},waveformPixels:rendered,checks:['separate pages','no scroll 1060x720 / 1200x800','record script toggle','compact controls','input meter','live waveform','PCM tone fidelity','immediate pause and frozen full/mini waveform','resume waveform','silence analysis/cleanup','real pointer drag: both edges and region','keyboard and simple less/more controls','one-decimal time ranges','selected pause audition','colored busy/ready/modified/success/empty states','reset automatic cuts','exact adjusted WAV duration','stale result invalidation','original unchanged','cleaned playback/seek/export','reader sync','preview playback/seek/export','persistent take sidebar','sidebar play/pause/edit/export/delete','library internal scrolling','library locked during recording','automatic take list update','draft/take persistence'],artifacts:path.resolve(__dirname,'../work')}));clearTimeout(deadline);app.exit(0);
 }catch(e){console.error(e,errors);await capture('failure');clearTimeout(deadline);app.exit(1);}
 });});require('./core-authority.cjs').startTestCore(temp).catch(error=>{console.error(error);app.exit(1);});require('../electron/main.cjs');
