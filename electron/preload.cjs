const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('voice', Object.freeze({
  devices: kind => ipcRenderer.invoke('voice:permission', kind),
  inputStatus: () => ipcRenderer.invoke('voice:input-status'),
  start: rate => ipcRenderer.invoke('voice:start', rate),
  append: (id, data) => ipcRenderer.invoke('voice:append', id, data),
  finish: id => ipcRenderer.invoke('voice:finish', id),
  list: () => ipcRenderer.invoke('voice:list'),
  waveform: id => ipcRenderer.invoke('voice:waveform', id),
  analyzeSilence: (id, options) => ipcRenderer.invoke('voice:analyze-silence', id, options),
  cleanSilence: (id, options) => ipcRenderer.invoke('voice:clean-silence', id, options),
  export: id => ipcRenderer.invoke('voice:export', id),
  remove: id => ipcRenderer.invoke('voice:remove', id),
  importText: () => ipcRenderer.invoke('voice:import'),
  openFolder: () => ipcRenderer.invoke('voice:folder')
}));
