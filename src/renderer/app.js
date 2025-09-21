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

// Initialize application
async function initializeApp() {
  try {
    console.log('[App] Initializing Eminium Launcher...');

    // Force close any leftover progress modals from previous sessions
    forceCloseAllProgress();

    // Initialize UI helpers
    if (window.UIHelpers) {
      window.UIHelpers.init();
    }

    // Initialize progress UI
    if (window.ProgressUI) {
      window.ProgressUI.initProgressUI();
    }

    // Initialize error manager
    if (window.ErrorManager) {
      window.ErrorManager.init();
    }

    // Initialize settings manager
    if (window.SettingsManager) {
      window.SettingsManager.init();
    }

    // Initialize logger
    if (window.Logger) {
      window.Logger.init();
    }

    // Start pinging server
    startPing();

    // Check for updates in background
    if (window.UpdaterManager) {
      window.UpdaterManager.initUpdaterManager();
    }

    // Auto-prepare game files if needed
    setTimeout(() => {
      checkAndAutoPrepare();
    }, 1000);

    console.log('[App] Initialization complete');
  } catch (error) {
    console.error('[App] Initialization error:', error);
    window.ErrorManager?.handleError(error, 'initialization');
  }
}

// Initialize game functionality
function initializeGameFunctionality() {
  // Use DOM utilities for better performance and cleaner code
  if (!window.DOMUtils) {
    console.error('DOMUtils not available');
    return;
  }
  
  // Game control buttons
  window.DOMUtils.addEventListener('btnCheck', 'click', async () => {
    await checkAndAutoPrepare();
  });
  
  window.DOMUtils.addEventListener('btnPlay', 'click', async () => {
    await launchGame();
  });
  
  // Update management buttons
  window.DOMUtils.addEventListener('btnCheckUpdates', 'click', async () => {
    if (window.UpdaterManager) {
      await window.UpdaterManager.checkForUpdates(true);
    }
  });
  
  window.DOMUtils.addEventListener('btnInstallUpdate', 'click', async () => {
    if (window.UpdaterManager) {
      await window.UpdaterManager.installUpdateManual();
    }
  });
  
  window.DOMUtils.addEventListener('btnUpdateSettings', 'click', () => {
    if (window.UpdaterManager) {
      window.UpdaterManager.showUpdateSettings();
    }
  });
  
  window.DOMUtils.addEventListener('btnForceUpdate', 'click', async () => {
    if (window.UpdaterManager) {
      await window.UpdaterManager.forceUpdate();
    }
  });
}

// Initialize server monitoring
function initializeServerMonitoring() {
  startPing();
}

// Initialize updater functionality
function initializeUpdater() {
  // Initialize the enhanced updater manager
  if (window.UpdaterManager) {
    window.UpdaterManager.initUpdaterManager();
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
    window.ErrorManager.handleError(error, 'auto-start');
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
    window.ErrorManager.handleError(error, 'ping');
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
  if (window.DOMUtils) {
    window.DOMUtils.setDisabled('btnPlay', !ready || !_appState.lastUp);
  }
}

// Force close all progress modals and reset state
function forceCloseAllProgress() {
  try {
    // Close any open progress modal
    if (window.ProgressUI && window.ProgressUI.close) {
      window.ProgressUI.close();
    }

    // Also try direct DOM manipulation as fallback
    const progressModal = document.getElementById('progressModal');
    if (progressModal) {
      progressModal.style.display = 'none';
    }

    // Reset any error notifications
    const errorNotifications = document.querySelectorAll('.error-notification, .update-notification');
    errorNotifications.forEach(notification => {
      notification.remove();
    });

    console.log('[App] Force closed all progress modals and notifications');
  } catch (error) {
    console.warn('[App] Error force closing progress modals:', error);
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
      setTimeout(() => window.ProgressUI.close(), 1500);
    } else {
      window.ErrorManager.handleError(new Error(res?.error || 'Échec de la préparation'), 'checkAndAutoPrepare');
      setReadyUI(false);
      window.ProgressUI.addLine('Échec de la préparation: ' + (res?.error || 'inconnu'));
      window.ProgressUI.enableClose();
      setTimeout(() => window.ProgressUI.close(), 1500);
    }
  } catch (error) {
    window.ErrorManager.handleError(error, 'checkAndAutoPrepare');
    setReadyUI(false);
    window.ProgressUI.addLine('Erreur IPC (ensure): ' + (error?.message || error));
    window.ProgressUI.enableClose();
    setTimeout(() => window.ProgressUI.close(), 1500);
  }
}

// Launch game
async function launchGame() {
  const memoryMB = parseInt(window.DOMUtils?.getValue('memSlider', '2048'), 10) || 2048;
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
      setTimeout(() => window.ProgressUI.close(), 1500);
    } else {
      window.ErrorManager.handleError(new Error(res?.error || 'Échec du lancement'), 'launchGame');
      window.ProgressUI.addLine('Échec du lancement: ' + (res?.error || 'inconnu'));
      window.ProgressUI.enableClose();
      setTimeout(() => window.ProgressUI.close(), 1500);
    }
  } catch (error) {
    window.ErrorManager.handleError(error, 'launchGame');
    window.ProgressUI.addLine('Erreur IPC (play): ' + (error?.message || error));
    window.ProgressUI.enableClose();
    setTimeout(() => window.ProgressUI.close(), 1500);
  }
}

// Run updater if needed
async function runUpdaterIfNeeded() {
  if (!window.UpdaterManager) return false;
  
  try {
    // Check for updates silently
    const result = await window.UpdaterManager.checkForUpdates(false);
    
    // If update is available, ask user if they want to install
    if (result?.ok && window.UpdaterManager.getUpdaterState().updateAvailable) {
      const state = window.UpdaterManager.getUpdaterState();
      
      // Show update notification and ask user
      if (confirm(`Une nouvelle version ${state.latestVersion} est disponible. Voulez-vous l'installer maintenant?`)) {
        await window.UpdaterManager.installUpdateManual();
        return true; // updater engaged; app will restart
      }
    }
  } catch (error) {
    window.ErrorManager.handleError(error, 'update');
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

// Handle keyboard shortcuts for debugging
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupKeyboardShortcuts);
} else {
  setupKeyboardShortcuts();
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // F5: Force refresh and close all modals
    if (event.key === 'F5') {
      event.preventDefault();
      forceCloseAllProgress();
      window.location.reload();
    }

    // Escape: Close all modals
    if (event.key === 'Escape') {
      forceCloseAllProgress();
    }

    // Ctrl+Shift+F: Force close and reset everything
    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      forceCloseAllProgress();
      console.log('[App] Force reset activated via Ctrl+Shift+F');
    }
  });
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
  forceCloseAllProgress,
  getState: () => ({ ..._appState })
};
