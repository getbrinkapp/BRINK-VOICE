const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('voice', Object.freeze({
  devices: kind => ipcRenderer.invoke('voice:permission', kind),
  inputStatus: () => ipcRenderer.invoke('voice:input-status'),
  start: rate => ipcRenderer.invoke('voice:start', rate),
  append: (id, data) => ipcRenderer.invoke('voice:append', id, data),
  finish: id => ipcRenderer.invoke('voice:finish', id),
  list: () => ipcRenderer.invoke('voice:list'),
  waveform: (id,view) => ipcRenderer.invoke('voice:waveform', id,view),
  analyzeSilence: (id, options) => ipcRenderer.invoke('voice:analyze-silence', id, options),
  cleanSilence: (id, options, cuts) => ipcRenderer.invoke('voice:clean-silence', id, options, cuts),
  export: id => ipcRenderer.invoke('voice:export', id),
  remove: id => ipcRenderer.invoke('voice:remove', id),
  importText: () => ipcRenderer.invoke('voice:import'),
  transcriptionInfo: () => ipcRenderer.invoke('voice:transcription-info'),
  transcriptionGet: id => ipcRenderer.invoke('voice:transcription-get',id),
  transcriptionStart: (id,language) => ipcRenderer.invoke('voice:transcription-start',id,language),
  transcriptionStatus: id => ipcRenderer.invoke('voice:transcription-status',id),
  transcriptionCancel: id => ipcRenderer.invoke('voice:transcription-cancel',id),
  transcriptionSave: (id,text) => ipcRenderer.invoke('voice:transcription-save',id,text),
  transcriptionScript: id => ipcRenderer.invoke('voice:transcription-script',id),
  transcriptionCopy: id => ipcRenderer.invoke('voice:transcription-copy',id),
  transcriptionExport: id => ipcRenderer.invoke('voice:transcription-export',id),
  library: () => ipcRenderer.invoke('voice:library'),
  saveScript: value => ipcRenderer.invoke('voice:script-save',value),
  removeScript: id => ipcRenderer.invoke('voice:script-remove',id),
  saveProject: value => ipcRenderer.invoke('voice:project-save',value),
  linkProject: id => ipcRenderer.invoke('voice:project-link',id),
  updateTake: (id,patch) => ipcRenderer.invoke('voice:take-meta',id,patch),
  importAudio: () => ipcRenderer.invoke('voice:audio-import'),
  renderAudio: input => ipcRenderer.invoke('voice:audio-render',input),
  jobStatus: id => ipcRenderer.invoke('voice:job-status',id),
  cancelJob: id => ipcRenderer.invoke('voice:job-cancel',id),
  removePreview: id => ipcRenderer.invoke('voice:preview-remove',id),
  handoff: (id,projectId) => ipcRenderer.invoke('voice:handoff',id,projectId),
  exportCine: id => ipcRenderer.invoke('voice:cine-export',id),
  openFolder: () => ipcRenderer.invoke('voice:folder')
}));

// Narrow Studio handoff: only a validated workspace request, never a path or command.
contextBridge.exposeInMainWorld('brinkCore', Object.freeze({
  projects: tool => ipcRenderer.invoke('brink-core:projects', tool),
  inspect: (tool, id) => ipcRenderer.invoke('brink-core:inspect', tool, id),
  open: context => ipcRenderer.invoke('brink-core:open', context),
  publish: (tool, id, input) => ipcRenderer.invoke('brink-core:publish', tool, id, input),
  attach: (tool, id, nativeId) => ipcRenderer.invoke('brink-core:attach', tool, id, nativeId),
  saveScript: (id, text, revision) => ipcRenderer.invoke('brink-core:script', id, text, revision),
  status: () => ipcRenderer.invoke('brink-core:status')
}));

contextBridge.exposeInMainWorld('brinkSuite', Object.freeze({
  onLaunch(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, { id, context }) => {
      Promise.resolve().then(() => callback(context))
        .then(result => ipcRenderer.send('brink-suite:result', id, result))
        .catch(() => ipcRenderer.send('brink-suite:result', id, { ok: false, code: 'launch_failed' }));
    };
    ipcRenderer.on('brink-suite:launch', listener);
    ipcRenderer.send('brink-suite:ready');
    return () => ipcRenderer.removeListener('brink-suite:launch', listener);
  }
}));
