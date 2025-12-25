const { contextBridge, ipcRenderer } = require('electron');

// Logger pour les appels IPC
const logIpc = (channel, ...args) => {
  // console.log(`[IPC] ${channel} appelé avec:`, ...args);
  return args;
};

// Wrapper pour ajouter le logging aux appels IPC
const withLogging = (channel, fn) => 
  async (...args) => {
    logIpc(channel, ...args);
    try {
      const result = await fn(...args);
      // console.log(`[IPC] ${channel} réussi:`, result);
      return result;
    } catch (error) {
      // console.error(`[IPC] ${channel} échoué:`, error);
      throw error;
    }
  };

// Exposer l'API au renderer avec logging
contextBridge.exposeInMainWorld('eminium', {
  // Authentification
  login: withLogging('auth:login', (email, password, code) => 
    ipcRenderer.invoke('auth:login', { email, password, code })
  ),
  logout: withLogging('auth:logout', () => 
    ipcRenderer.invoke('auth:logout')
  ),
  getProfile: withLogging('auth:profile:get', () => 
    ipcRenderer.invoke('auth:profile:get')
  ),
  
  // Gestion du launcher
  ensure: withLogging('launcher:ensure', () => 
    ipcRenderer.invoke('launcher:ensure')
  ),
  play: withLogging('launcher:play', (opts) => 
    ipcRenderer.invoke('launcher:play', opts)
  ),
  status: withLogging('launcher:status', () => 
    ipcRenderer.invoke('launcher:status')
  ),
  prepare: withLogging('launcher:prepare', () => 
    ipcRenderer.invoke('launcher:prepare')
  ),
  
  // Utilitaires réseau
  ping: withLogging('launcher:ping', (host, port, timeout = 3000) => 
    ipcRenderer.invoke('launcher:ping', { host, port, timeout })
  ),
  
  // Informations système
  getSystemRamMB: withLogging('sys:ram:totalMB', () => 
    ipcRenderer.invoke('sys:ram:totalMB')
  ),
  
  // Paramètres
  getSettings: withLogging('settings:get', () => 
    ipcRenderer.invoke('settings:get')
  ),
  setSettings: withLogging('settings:set', (patch) => 
    ipcRenderer.invoke('settings:set', patch)
  ),
  
  // Maintenance
  getMaintenance: withLogging('maintenance:get', () => 
    ipcRenderer.invoke('maintenance:get')
  )
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

// (shop bridges removed)

// Policy reminders (e.g., VPN/Proxy forbidden)
// Broadcast remote maintenance changes
contextBridge.exposeInMainWorld('eminiumMaintenance', {
  onChanged: (cb) => {
    const handler = (_evt, data) => cb?.(data);
    ipcRenderer.on('maintenance:changed', handler);
    return () => ipcRenderer.removeListener('maintenance:changed', handler);
  }
});

// (payments notifications removed)

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
