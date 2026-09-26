const {app, BrowserWindow, ipcMain, dialog, protocol, net, session, systemPreferences, shell, Menu} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Recordings} = require('./recordings.cjs');
const silence = require('./silence.cjs');
const {inputStatus} = require('./input-status.cjs');
const {audioResponse} = require('./audio-response.cjs');
app.setName('VOICE');
protocol.registerSchemesAsPrivileged([{scheme: 'voice', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}}]);
const appDir = path.join(__dirname, '../app');
let win, store;
const trusted = url => url === 'voice://app/index.html';
function handle(name, fn) {
  ipcMain.handle(`voice:${name}`, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url)) throw Error('Zugriff verweigert.');
    return fn(...args);
  });
}
function createWindow() {
  win = new BrowserWindow({width: 1440, height: 930, minWidth: 1060, minHeight: 720, title: 'VOICE', backgroundColor: '#17181C',
    icon: path.join(__dirname, '../build/brink.png'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false}});
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => {
    if (store.active) { e.preventDefault(); dialog.showMessageBox(win, {type: 'info', message: 'Bitte zuerst die Aufnahme stoppen.', detail: 'Dein Take wird dabei fertig gespeichert. Danach kannst du VOICE schließen.', buttons: ['Zurück zur Aufnahme']}); }
  });
  win.webContents.on('render-process-gone', async () => {
    if (store.active) await store.finish(store.active.id).catch(console.error);
  });
  win.loadURL('voice://app/index.html');
  if (process.argv.includes('--dev')) win.webContents.openDevTools({mode: 'detach'});
}
app.whenReady().then(async () => {
  store = new Recordings(path.join(app.getPath('userData'), 'Recordings')); await store.init();
  protocol.handle('voice', async request => {
    const u = new URL(request.url);
    let file;
    if (u.hostname === 'take') { try { return await audioResponse(store.file(u.pathname.slice(1)), request); } catch { return new Response('', {status: 404}); } }
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
  handle('start', rate => store.start(rate));
  handle('append', (id, data) => store.append(id, data));
  handle('finish', id => store.finish(id));
  handle('list', () => store.list());
  handle('waveform', id => store.waveform(id));
  handle('analyze-silence', async (id, options) => silence.summary(await silence.analyze(store.file(id), options)));
  let editing = false;
  handle('clean-silence', async (id, options) => {
    if(editing) throw Error('Eine Bereinigung läuft bereits.');
    editing=true; try {return await silence.clean(store,id,options);} finally {editing=false;}
  });
  handle('folder', () => shell.openPath(store.dir));
  handle('export', async id => {
    const src = store.file(id); await fs.access(src);
    const {canceled, filePath} = await dialog.showSaveDialog(win, {defaultPath: `VOICE-${new Date().toISOString().slice(0,10)}-${id.slice(0,8)}.wav`, filters: [{name: 'WAV-Audio', extensions: ['wav']}]});
    if (canceled || !filePath) return false;
    if (path.resolve(filePath) !== src) await fs.copyFile(src, filePath);
    return true;
  });
  handle('remove', async id => {
    const file = store.file(id);
    const {response} = await dialog.showMessageBox(win, {type: 'warning', message: 'Diesen Take löschen?', detail: 'Die lokale Aufnahme wird dauerhaft gelöscht. Bereits exportierte Dateien bleiben erhalten.', buttons: ['Abbrechen', 'Take löschen'], defaultId: 0, cancelId: 0});
    if (response !== 1) return false; await fs.unlink(file); await fs.unlink(file+'.json').catch(()=>{}); return true;
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
  createWindow(); app.on('activate', () => {if (!BrowserWindow.getAllWindows().length) createWindow();});
}).catch(e => { console.error(e); dialog.showErrorBox('VOICE konnte nicht starten', e.message); app.quit(); });
app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit();});
