const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eminium', {
  login: (email, password, code) => ipcRenderer.invoke('auth:login', { email, password, code }),
  ensure: () => ipcRenderer.invoke('launcher:ensure'),
  play: (opts) => ipcRenderer.invoke('launcher:play', opts),
  status: () => ipcRenderer.invoke('launcher:status'),
  prepare: () => ipcRenderer.invoke('launcher:prepare'),
  getProfile: () => ipcRenderer.invoke('auth:profile:get'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  ping: (host, port, timeout=3000) => ipcRenderer.invoke('launcher:ping', { host, port, timeout }),
  // System info helpers
  getSystemRamMB: () => ipcRenderer.invoke('sys:ram:totalMB'),
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch)
});

// Progress event subscriptions
contextBridge.exposeInMainWorld('eminiumProgress', {
  onEnsureProgress: (cb) => ipcRenderer.on('ensure:progress', (_evt, data) => cb?.(data)),
  onPlayProgress: (cb) => ipcRenderer.on('play:progress', (_evt, data) => cb?.(data))
});

// Updater (branch-based)
contextBridge.exposeInMainWorld('updater', {
  check: (opts) => ipcRenderer.invoke('updater:check', opts || {}),
  download: (info) => ipcRenderer.invoke('updater:download', info),
  apply: (info) => ipcRenderer.invoke('updater:apply', info),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onProgress: (cb) => ipcRenderer.on('update:progress', (_evt, data) => cb?.(data))
});
