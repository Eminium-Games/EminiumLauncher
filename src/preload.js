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
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  // Maintenance (Azuriom)
  getMaintenance: () => ipcRenderer.invoke('maintenance:get')
});

// Progress event subscriptions
contextBridge.exposeInMainWorld('eminiumProgress', {
  onEnsureProgress: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('ensure:progress', handler);
    return () => ipcRenderer.removeListener('ensure:progress', handler);
  },
  onPlayProgress: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('play:progress', handler);
    return () => ipcRenderer.removeListener('play:progress', handler);
  }
});

// Policy reminders (e.g., VPN/Proxy forbidden)
contextBridge.exposeInMainWorld('eminiumPolicy', {
  onReminder: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('policy:reminder', handler);
    return () => ipcRenderer.removeListener('policy:reminder', handler);
  }
});

// Broadcast remote maintenance changes
contextBridge.exposeInMainWorld('eminiumMaintenance', {
  onChanged: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('maintenance:changed', handler);
    return () => ipcRenderer.removeListener('maintenance:changed', handler);
  }
});

// Updater (branch-based)
contextBridge.exposeInMainWorld('updater', {
  check: (opts) => ipcRenderer.invoke('updater:check', opts || {}),
  download: (info) => ipcRenderer.invoke('updater:download', info),
  apply: (info) => ipcRenderer.invoke('updater:apply', info),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onProgress: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  offProgress: () => ipcRenderer.removeAllListeners('update:progress')
});
