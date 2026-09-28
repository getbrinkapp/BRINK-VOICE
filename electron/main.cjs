const {app, BrowserWindow, ipcMain, dialog, protocol, net, session, systemPreferences, shell, Menu, clipboard} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Recordings} = require('./recordings.cjs');
const {Library}=require('./library.cjs');
const {Transcriptions}=require('./transcription.cjs');
const {AudioJobs}=require('./audio-jobs.cjs');
const handoff=require('./handoff.cjs');
const silence = require('./silence.cjs');
const {inputStatus} = require('./input-status.cjs');
const {audioResponse} = require('./audio-response.cjs');
app.setName('VOICE');
if (process.env.BRINK_SUITE_PROFILE) app.setPath('userData', process.env.BRINK_SUITE_PROFILE);
if (!app.requestSingleInstanceLock()) app.exit(0);

protocol.registerSchemesAsPrivileged([{scheme: 'voice', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}}]);
const appDir = path.join(__dirname, '../app');
let win, store, library, jobs, transcriptions;
const processing=()=>jobs?.active||transcriptions?.active;
const trusted = url => url === 'voice://app/index.html';
app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  }
});
const suiteHost = require('./suite/host.cjs').registerCreativeHost({
  tools: ['voice'], getWindow: () => win, createWindow, trustedURL: trusted,
});

function handle(name, fn) {
  ipcMain.handle(`voice:${name}`, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url)) throw Error('Zugriff verweigert.');
    // Completing an already started recording must remain possible on revocation.
    if(!['append','finish','script-save','job-cancel','transcription-cancel'].includes(name))await suiteHost.core.authorize();
    return fn(...args);
  });
}
function createWindow() {
  win = new BrowserWindow({width: 1440, height: 930, minWidth: 1060, minHeight: 720, title: 'VOICE', backgroundColor: '#17181C',
    icon: path.join(__dirname, '../build/voice.png'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false}});
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => {
    if (store.active || processing()) { e.preventDefault(); dialog.showMessageBox(win, {type: 'info', message: processing()?'Bitte zuerst die Audioverarbeitung beenden oder abbrechen.':'Bitte zuerst die Aufnahme stoppen.', detail: 'Dein Take wird dabei fertig gespeichert. Danach kannst du VOICE schließen.', buttons: ['Zurück zur Aufnahme']}); }
  });
  win.webContents.on('render-process-gone', async () => {
    if(jobs.active)jobs.cancel(jobs.active.id);
    if(transcriptions.active)transcriptions.cancel(transcriptions.active.id);
    if (store.active) await store.finish(store.active.id).catch(console.error);
  });
  win.loadURL('voice://app/index.html');
  if (process.argv.includes('--dev')) win.webContents.openDevTools({mode: 'detach'});
}
app.whenReady().then(async () => {
  if(!await suiteHost.core.start())return;
  store = new Recordings(path.join(app.getPath('userData'), 'Recordings')); await store.init();
  library=new Library(path.join(app.getPath('userData'),'library.json'));await library.init();
  suiteHost.core.configure({
    async open(snapshot,request){
      if(store.active||processing())throw Error('Bitte die Aufnahme oder Verarbeitung zuerst beenden.');
      const previous=library.data.projects.find(p=>p.id===snapshot.id),local=library.data.scripts.find(s=>s.id===snapshot.id);
      if(local&&previous?.coreScript!==undefined&&local.text!==previous.coreScript&&snapshot.script!==previous.coreScript)throw Error('Das Script wurde in BRINK und VOICE geändert. Deine VOICE-Fassung bleibt erhalten. Bitte die Fassungen vor der Übernahme abgleichen.');
      await library.mutate(data=>{let project=data.projects.find(p=>p.id===snapshot.id);if(!project){project={id:snapshot.id};data.projects.push(project);}Object.assign(project,{name:snapshot.name,core:true,coreScript:snapshot.script,coreRevision:snapshot.scriptRevision});});
      const script=await library.scriptSave({id:snapshot.id,title:snapshot.name.slice(0,160),text:local&&local.text!==previous?.coreScript?local.text:snapshot.script,projectId:snapshot.id});
      let importJob=null;
      if(request.assetId){const asset=snapshot.assets.find(a=>a.id===request.assetId);if(asset?.kind!=='audio')throw Error('VOICE kann nur Audio importieren.');importJob=jobs.start({operation:'import',source:asset.path,name:path.basename(asset.name,path.extname(asset.name))});}
      return {projectId:snapshot.id,scriptId:script.id,scriptRevision:snapshot.scriptRevision,importJob:await importJob,nativeId:snapshot.documents.find(d=>d.id===request.documentId)?.nativeId||null};
    },
    async publish(_tool,input){if(store.active||processing())throw Error('Bitte zuerst die Aufnahme oder Verarbeitung beenden.');const meta=await store.metadata(input?.nativeId);return {source:store.file(input.nativeId),name:meta.name||'VOICE',deliveryId:input.nativeId};},
    async document(_tool,id){const meta=await store.metadata(id);return {nativeId:id,title:meta.name||'VOICE-Aufnahme'};},
    async scriptSaved(id,text,revision){await library.mutate(data=>{const project=data.projects.find(p=>p.id===id);if(project)Object.assign(project,{coreScript:text,coreRevision:revision});});}
  });
  const jobRoot=path.join(app.getPath('userData'),'AudioCache');await fs.rm(jobRoot,{recursive:true,force:true});jobs=new AudioJobs(store,jobRoot);await jobs.init();
  transcriptions=new Transcriptions({store,root:path.join(app.getPath('userData'),'Transcripts'),cache:path.join(app.getPath('userData'),'TranscriptionCache'),runtime:app.isPackaged?path.join(process.resourcesPath,'whisper'):path.join(__dirname,'../runtime/whisper')});await transcriptions.init();
  protocol.handle('voice', async request => {
    const u = new URL(request.url);
    let file;
    if(u.hostname==='preview'){try{return await audioResponse(jobs.preview(u.pathname.slice(1)),request);}catch{return new Response('',{status:404});}}
    else if (u.hostname === 'take') { try { return await audioResponse(store.file(u.pathname.slice(1)), request); } catch { return new Response('', {status: 404}); } }
    else if (u.hostname === 'app') {
      file = path.resolve(appDir, '.' + decodeURIComponent(u.pathname));
      if (!file.startsWith(appDir + path.sep)) return new Response('', {status: 403});
    } else return new Response('', {status: 404});
    try { return await net.fetch(pathToFileURL(file).href, {headers: request.headers}); } catch { return new Response('', {status: 404}); }
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin, details) => details?.mediaType !== 'video' && wc === win?.webContents && trusted(wc.getURL()) && permission === 'media');
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(wc === win?.webContents && trusted(wc.getURL()) && permission === 'media' && (details.mediaTypes || []).every(t => t === 'audio')));
  handle('permission', async kind => {
    if (kind !== 'microphone') throw Error('Unbekanntes Gerät.');
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess(kind);
  });
  handle('input-status', () => inputStatus(systemPreferences));
  handle('start', rate => {if(processing())throw Error('Bitte die Audioverarbeitung zuerst beenden.');return store.start(rate);});
  handle('append', (id, data) => store.append(id, data));
  handle('finish', id => store.finish(id));
  handle('list', () => store.list());
  handle('waveform', (id,view) => store.waveform(id,view));
  handle('analyze-silence', async (id, options) => silence.summary(await silence.analyze(store.file(id), options)));
  let editing = false;
  handle('clean-silence', async (id, options, cuts) => {
    if(editing||processing()) throw Error('Eine Bereinigung läuft bereits.');
    editing=true; try {return await silence.clean(store,id,options,cuts);} finally {editing=false;}
  });
  handle('library',()=>library.view());
  handle('script-save',value=>library.scriptSave(value));
  handle('script-remove',async id=>{const {response}=await dialog.showMessageBox(win,{type:'warning',message:'Dieses Script löschen?',detail:'Aufnahmen bleiben erhalten.',buttons:['Abbrechen','Script löschen'],defaultId:0,cancelId:0});if(response!==1)return false;await library.scriptRemove(id);for(const take of await store.list())if(take.scriptId===id)await store.patchMetadata(take.id,{scriptId:null});return true;});
  handle('project-save',value=>library.projectSave(value));
  handle('project-link',async id=>{if(!library.project(id))throw Error('Projekt nicht gefunden.');const choice=await dialog.showOpenDialog(win,{title:'BRINK-Projektordner auswählen',properties:['openDirectory']});if(choice.canceled)return null;const p=await handoff.projectFolder(choice.filePaths[0]);return library.linkProject(id,p.root);});
  handle('take-meta',async(id,patch)=>{if(store.active||processing())throw Error('Bitte die Aufnahme oder Verarbeitung zuerst beenden.');if(patch.scriptId&&!library.data.scripts.some(s=>s.id===patch.scriptId))throw Error('Script nicht gefunden.');if(patch.projectId&&!library.project(patch.projectId))throw Error('Projekt nicht gefunden.');return store.patchMetadata(id,patch);});
  handle('audio-import',async()=>{
    if(store.active||processing())throw Error('Bitte die Aufnahme oder Verarbeitung zuerst beenden.');
    const choice=await dialog.showOpenDialog(win,{title:'Audio importieren',properties:['openFile'],filters:[{name:'Audio',extensions:['wav','mp3','m4a','aac','flac','ogg','aif','aiff','webm']}]});if(choice.canceled)return null;
    const source=choice.filePaths[0],stat=await fs.stat(source);if(!stat.isFile()||stat.size>2*1024*1024*1024)throw Error('Bitte eine Audiodatei bis 2 GB auswählen.');
    return jobs.start({operation:'import',source,name:path.basename(source,path.extname(source))});
  });
  handle('audio-render',input=>{if(transcriptions.active)throw Error('Bitte die Transkription zuerst beenden.');return jobs.start({id:input.id,cuts:input.cuts,effects:input.effects,preview:input.preview===true});});
  handle('job-status',id=>jobs.status(id));handle('job-cancel',id=>jobs.cancel(id));
  handle('preview-remove',async id=>{await fs.unlink(jobs.preview(id)).catch(()=>{});return true;});
  handle('handoff',async(id,projectId)=>{const project=library.project(projectId);const meta=await store.metadata(id);if(project?.core){const result=await suiteHost.core.call('publish',['voice',projectId,{source:store.file(id),name:meta.name||'VOICE',deliveryId:id}]);await suiteHost.core.call('attach',['voice',projectId,{nativeId:id,title:meta.name||'VOICE'}]);return result;}if(!project?.root)throw Error('Bitte zuerst einen BRINK-Projektordner verbinden.');return handoff.deliver(store.file(id),project.root,meta.name||'VOICE-'+id.slice(0,8));});
  handle('cine-export',async id=>{const meta=await store.metadata(id);const choice=await dialog.showSaveDialog(win,{title:'Voice-over für CINE speichern',defaultPath:handoff.safeName(meta.name||'Voice-over')+'.brinkvideo',filters:[{name:'CINE-Projekt',extensions:['brinkvideo']}]});if(choice.canceled)return null;const file=choice.filePath.endsWith('.brinkvideo')?choice.filePath:choice.filePath+'.brinkvideo';return handoff.cine(store.file(id),file,meta.name||'Voice-over');});
  handle('transcription-info',()=>transcriptions.available());
  handle('transcription-get',id=>transcriptions.get(id));
  handle('transcription-start',async(id,language)=>{if(jobs.active||editing||store.active||transcriptions.active)throw Error('Bitte die laufende Aufnahme oder Verarbeitung zuerst beenden.');const previous=await transcriptions.get(id);if(previous?.text){const {response}=await dialog.showMessageBox(win,{type:'question',message:'Diesen Take erneut transkribieren?',detail:'Der bisherige Transkript-Text wird nach erfolgreicher Erkennung ersetzt. Gespeicherte Scripts bleiben erhalten.',buttons:['Abbrechen','Neu transkribieren'],defaultId:0,cancelId:0});if(response!==1)return null;}if(jobs.active||editing)throw Error('Bitte die Audioverarbeitung zuerst beenden.');return transcriptions.start(id,language);});
  handle('transcription-status',id=>transcriptions.status(id));
  handle('transcription-cancel',id=>transcriptions.cancel(id));
  handle('transcription-save',(id,text)=>transcriptions.save(id,text));
  handle('transcription-script',async id=>{const transcript=await transcriptions.get(id);if(!transcript?.text.trim())throw Error('Das Transkript ist leer.');const meta=await store.metadata(id);return library.scriptSave({title:((meta.name||'Voice-over')+' · Transkript').slice(0,160),text:transcript.text,projectId:meta.projectId||null});});
  handle('transcription-copy',async id=>{const transcript=await transcriptions.get(id);if(!transcript)throw Error('Kein Transkript vorhanden.');clipboard.writeText(transcript.text);return true;});
  handle('transcription-export',async id=>{const transcript=await transcriptions.get(id);if(!transcript)throw Error('Kein Transkript vorhanden.');const meta=await store.metadata(id);const choice=await dialog.showSaveDialog(win,{title:'Transkript als Text speichern',defaultPath:handoff.safeName(meta.name||'VOICE-Transkript')+'.txt',filters:[{name:'Text',extensions:['txt']}]});if(choice.canceled||!choice.filePath)return false;const file=choice.filePath.endsWith('.txt')?choice.filePath:choice.filePath+'.txt';await fs.writeFile(file,transcript.text,'utf8');return true;});
  handle('folder', () => shell.openPath(store.dir));
  handle('export', async id => {
    const src = store.file(id); await fs.access(src);
    const {canceled, filePath} = await dialog.showSaveDialog(win, {defaultPath: handoff.safeName((await store.metadata(id)).name||`VOICE-${new Date().toISOString().slice(0,10)}-${id.slice(0,8)}`)+'.wav', filters: [{name: 'WAV-Audio', extensions: ['wav']}]});
    if (canceled || !filePath) return false;
    if (path.resolve(filePath) !== src) await fs.copyFile(src, filePath);
    return true;
  });
  handle('remove', async id => {
    if(store.active||processing())throw Error('Bitte die Aufnahme oder Verarbeitung zuerst beenden.');
    const file = store.file(id);
    const {response} = await dialog.showMessageBox(win, {type: 'warning', message: 'Diesen Take löschen?', detail: 'Die lokale Aufnahme wird dauerhaft gelöscht. Bereits exportierte Dateien bleiben erhalten.', buttons: ['Abbrechen', 'Take löschen'], defaultId: 0, cancelId: 0});
    if (response !== 1) return false; await fs.unlink(file); await fs.unlink(file+'.json').catch(()=>{});await transcriptions.remove(id); return true;
  });
  handle('import', async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog(win, {properties: ['openFile'], filters: [{name: 'Skript / Untertitel', extensions: ['txt', 'md', 'srt', 'vtt']}]});
    if (canceled) return null;
    const stat = await fs.stat(filePaths[0]); if (stat.size > 2 * 1024 * 1024) throw Error('Bitte eine Textdatei bis 2 MB auswählen.');
    return {name: path.basename(filePaths[0]), text: await fs.readFile(filePaths[0], 'utf8')};
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{label: 'VOICE', submenu: [{role: 'about'}, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {type:'separator'}, {role:'quit'}]}] : []),
    {label: 'Bearbeiten', submenu: [{role:'undo'}, {role:'redo'}, {type:'separator'}, {role:'cut'}, {role:'copy'}, {role:'paste'}, {role:'selectAll'}]},
    {label: 'Ansicht', submenu: [{role:'togglefullscreen'}, {role:'resetZoom'}, {role:'zoomIn'}, {role:'zoomOut'}]},
    {label: 'Fenster', submenu: [{role:'minimize'}, {role:'close'}]}
  ]));
  createWindow(); await suiteHost.start(); app.on('activate', () => {if (!BrowserWindow.getAllWindows().length) createWindow();});
}).catch(e => { console.error(e); dialog.showErrorBox('VOICE konnte nicht starten', e.message); app.quit(); });
app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit();});
