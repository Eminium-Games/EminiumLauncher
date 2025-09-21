/**
 * Main Application Initialization for Eminium Launcher
 * Coordinates all modules and initializes the application
 */

// Application state
let _appState = {
  initialized: false,
  ready: false,
  serverUp: false,
  pingTimer: null,
  lastUp: undefined
};

// Initialize all modules
async function initializeApp() {
  if (_appState.initialized) return;
  
  try {
    window.Logger.info('Initializing Eminium Launcher...');
    
    // Initialize all modules in order
    window.UIHelpers.initUIHelpers();
    window.ProgressUI.initProgressUI();
    window.AuthManager.initAuthManager();
    window.OAuthManager.initOAuthManager();
    await window.SettingsManager.initSettingsManager();
    
    // Initialize game functionality
    initializeGameFunctionality();
    
    // Initialize server monitoring
    initializeServerMonitoring();
    
    // Initialize updater
    initializeUpdater();
    
    // Set up auto-startup flow
    await autoStartFlow();
    
    _appState.initialized = true;
    window.Logger.success('Eminium Launcher initialized successfully!');
    
  } catch (error) {
    window.Logger.error('Failed to initialize application: ' + error.message);
    console.error('Initialization error:', error);
  }
}

// Initialize game functionality
function initializeGameFunctionality() {
  const btnPlay = document.getElementById('btnPlay');
  const btnCheck = document.getElementById('btnCheck');
  
  // Check/Prepare button
  if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
      await checkAndAutoPrepare();
    });
  }
  
  // Play button
  if (btnPlay) {
    btnPlay.addEventListener('click', async () => {
      await launchGame();
    });
  }
}

// Initialize server monitoring
function initializeServerMonitoring() {
  startPing();
}

// Initialize updater functionality
function initializeUpdater() {
  // Updater is handled in the main process, just set up progress listeners
  if (window.updater) {
    window.updater.onProgress((data) => {
      if (!data) return;
      
      if (data.phase === 'downloading') {
        const curr = data.currentFile || 1;
        const total = data.totalFiles || 1;
        const p = typeof data.percent === 'number' ? data.percent : 0;
        window.ProgressUI.set(Math.max(1, Math.min(100, p | 0)));
        window.ProgressUI.addLine(`Téléchargement des mises à jour ${curr}/${total}`);
      } else if (data.phase === 'downloaded') {
        window.ProgressUI.set(100);
        window.ProgressUI.addLine('Téléchargement terminé. Application de la mise à jour...');
      } else if (data.phase === 'applying') {
        const curr = data.currentFile || 0;
        const total = data.totalFiles || 0;
        if (total > 0) window.ProgressUI.set(Math.round((curr / total) * 100));
      } else if (data.phase === 'error') {
        window.ProgressUI.addLine('Erreur de mise à jour: ' + (data.message || 'inconnue'), 'err');
        window.ProgressUI.enableClose();
      }
    });
  }
}

// Auto-startup flow
async function autoStartFlow() {
  try {
    setReadyUI(false);
    startPing();
    const didUpdate = await runUpdaterIfNeeded();
    if (!didUpdate) {
      await checkAndAutoPrepare();
    }
  } catch (error) {
    window.Logger.error('Error in auto-start flow: ' + error.message);
  }
}

// Server ping functionality
async function pingOnce() {
  try {
    const result = await window.eminium.ping('play.eminium.ovh', 25565, 3000);
    const up = result?.up || false;
    
    if (up !== _appState.lastUp) {
      _appState.lastUp = up;
      setReadyUI(_appState.ready);
    }
    
    return up;
  } catch (error) {
    console.warn('Ping error:', error);
    return false;
  }
}

function startPing() {
  if (_appState.pingTimer) {
    clearInterval(_appState.pingTimer);
  }
  
  _appState.pingTimer = setInterval(pingOnce, 5000);
  pingOnce(); // Initial ping
}

// Set ready UI state
function setReadyUI(ready) {
  _appState.ready = ready;
  const btnPlay = document.getElementById('btnPlay');
  if (btnPlay) {
    btnPlay.disabled = !ready || !_appState.lastUp;
  }
}

// Check and auto-prepare game files
async function checkAndAutoPrepare() {
  try {
    window.ProgressUI.open('Préparation');
    window.ProgressUI.set(5);
    window.Logger.info('Vérification des fichiers...');
    
    const res = await window.eminium.ensure();
    
    if (res?.ok) {
      window.Logger.success('Fichiers prêts ✓');
      setReadyUI(true);
      window.ProgressUI.set(100);
      window.ProgressUI.addLine('Fichiers prêts ✓');
      window.ProgressUI.enableClose();
    } else {
      window.Logger.error('Échec de la préparation: ' + (res?.error || 'inconnu'));
      setReadyUI(false);
      window.ProgressUI.addLine('Échec de la préparation: ' + (res?.error || 'inconnu'));
      window.ProgressUI.enableClose();
    }
  } catch (error) {
    window.Logger.error('Erreur IPC (ensure): ' + (error?.message || error));
    setReadyUI(false);
    window.ProgressUI.addLine('Erreur IPC (ensure): ' + (error?.message || error));
    window.ProgressUI.enableClose();
  }
}

// Launch game
async function launchGame() {
  const memoryMB = parseInt(document.getElementById('memSlider').value, 10) || 2048;
  const serverHost = 'play.eminium.ovh';
  const serverPort = 25565;
  
  try {
    window.ProgressUI.open('Lancement');
    window.ProgressUI.set(10);
    window.Logger.info(`Lancement de Minecraft... (RAM: ${memoryMB} Mo, ${serverHost}:${serverPort})`);
    
    const res = await window.eminium.play({ memoryMB, serverHost, serverPort });
    
    if (res?.ok) {
      window.Logger.success('Client lancé ✓');
      window.ProgressUI.set(100);
      window.ProgressUI.addLine('Client lancé ✓');
      window.ProgressUI.enableClose();
    } else {
      window.Logger.error('Échec du lancement: ' + (res?.error || 'inconnu'));
      window.ProgressUI.addLine('Échec du lancement: ' + (res?.error || 'inconnu'));
      window.ProgressUI.enableClose();
    }
  } catch (error) {
    window.Logger.error('Erreur IPC (play): ' + (error?.message || error));
    window.ProgressUI.addLine('Erreur IPC (play): ' + (error?.message || error));
    window.ProgressUI.enableClose();
  }
}

// Run updater if needed
async function runUpdaterIfNeeded() {
  if (!window.updater) return false;
  
  try {
    const res = await window.updater.check();
    
    if (res?.ok && res.updateAvailable && res.latest?.assetUrl && res.latest?.tag) {
      window.ProgressUI.open('Mise à jour du launcher');
      window.ProgressUI.set(5);
      window.ProgressUI.addLine('Préparation du téléchargement...');
      
      const dl = await window.updater.download({ 
        assetUrl: res.latest.assetUrl, 
        tag: res.latest.tag 
      });
      
      if (!dl?.ok) {
        window.ProgressUI.addLine('Erreur téléchargement: ' + (dl?.error || 'inconnue'), 'err');
        window.ProgressUI.enableClose();
        return true;
      }
      
      const ap = await window.updater.apply({ tag: res.latest.tag });
      
      if (!ap?.ok) {
        window.ProgressUI.addLine('Erreur application: ' + (ap?.error || 'inconnue'), 'err');
        window.ProgressUI.enableClose();
        return true;
      }
      
      window.ProgressUI.addLine('Mise à jour appliquée. Redémarrage...');
      window.ProgressUI.set(100);
      
      try {
        await window.updater.relaunch();
      } catch (error) {
        console.warn('Error relaunching:', error);
      }
      
      return true; // updater engaged; app will restart
    }
  } catch (error) {
    console.warn('Updater error:', error);
  }
  
  return false;
}

// Handle page visibility changes
function handleVisibilityChange() {
  if (document.hidden) {
    // Page is hidden, pause non-essential operations
    if (_appState.pingTimer) {
      clearInterval(_appState.pingTimer);
      _appState.pingTimer = null;
    }
  } else {
    // Page is visible again, resume operations
    startPing();
  }
}

// Handle window unload
function handleUnload() {
  // Clean up timers
  if (_appState.pingTimer) {
    clearInterval(_appState.pingTimer);
    _appState.pingTimer = null;
  }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Set up event listeners
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', handleUnload);

// Export app functions for debugging
window.App = {
  initializeApp,
  pingOnce,
  startPing,
  setReadyUI,
  checkAndAutoPrepare,
  launchGame,
  runUpdaterIfNeeded,
  getState: () => ({ ..._appState })
};
