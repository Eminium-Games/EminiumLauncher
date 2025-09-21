/**
 * Main Application Initialization for Eminium Launcher
 * Coordinates all modules and initializes the application
 */

// Application state
let _appState = {
  initialized: false,
  ready: false,
  authenticated: false,
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

    // Initialize UI helpers first
    if (window.UIHelpers) {
      window.UIHelpers.initUIHelpers();
    }

    // Initialize authentication manager FIRST - this will check if user is already logged in
    if (window.AuthManager) {
      console.log('[App] Checking authentication status...');
      await window.AuthManager.initAuthManager();

      // Get authentication status after initialization
      _appState.authenticated = await window.AuthManager.checkAuthStatus();
      console.log('[App] Authentication status:', _appState.authenticated);
    }

    // Initialize progress UI
    if (window.ProgressUI) {
      window.ProgressUI.initProgressUI();
    }

    // Initialize settings manager
    if (window.SettingsManager) {
      window.SettingsManager.initSettingsManager();
    }

    // Initialize logger
    if (window.Logger) {
      window.Logger.init();
    }

    // Apply saved settings to UI
    applySettingsToUI();

    // Start pinging server
    startPing();

    // Check for updates in background
    if (window.UpdaterManager) {
      window.UpdaterManager.initUpdaterManager();
    }

    // Auto-prepare game files if needed (only if authenticated)
    if (_appState.authenticated) {
      setTimeout(() => {
        checkAndAutoPrepare();
      }, 1000);
    }

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

  // Initialize real-time slider updates
  initializeSliderUpdates();
}

// Initialize real-time slider value updates
function initializeSliderUpdates() {
  // Memory slider
  const memSlider = document.getElementById('memSlider');
  const memValue = document.getElementById('memValue');

  if (memSlider && memValue) {
    memSlider.addEventListener('input', () => {
      updateSliderValue(memSlider, memValue, 'Mo');
    });
  }

  // Render distance slider
  const renderSlider = document.getElementById('renderSlider');
  const renderValue = document.getElementById('renderValue');

  if (renderSlider && renderValue) {
    renderSlider.addEventListener('input', () => {
      updateSliderValue(renderSlider, renderValue, 'chunks');
    });
  }

  // FPS slider
  const fpsSlider = document.getElementById('fpsSlider');
  const fpsValue = document.getElementById('fpsValue');

  if (fpsSlider && fpsValue) {
    fpsSlider.addEventListener('input', () => {
      updateSliderValue(fpsSlider, fpsValue, 'FPS', fpsSlider.max);
    });
  }

  // Initialize toggle functionality
  initializeToggleFunctionality();
}

// Initialize toggle functionality
function initializeToggleFunctionality() {
  // VSync toggle
  const vsyncToggle = document.getElementById('vsyncToggle');
  const vsyncInput = document.getElementById('vsyncInput');

  if (vsyncToggle && vsyncInput) {
    vsyncToggle.addEventListener('click', () => {
      vsyncInput.checked = !vsyncInput.checked;
      console.log(`[Settings] VSync: ${vsyncInput.checked ? 'ON' : 'OFF'}`);
      saveSetting('vsync', vsyncInput.checked);
    });
  }

  // Unlimited FPS toggle
  const unlimitedFpsToggle = document.getElementById('unlimitedFpsToggle');
  const unlimitedFpsInput = document.getElementById('unlimitedFpsInput');

  if (unlimitedFpsToggle && unlimitedFpsInput) {
    unlimitedFpsToggle.addEventListener('click', () => {
      unlimitedFpsInput.checked = !unlimitedFpsInput.checked;
      console.log(`[Settings] Unlimited FPS: ${unlimitedFpsInput.checked ? 'ON' : 'OFF'}`);
      saveSetting('unlimitedFps', unlimitedFpsInput.checked);
    });
  }

  // Close on play toggle
  const closeOnPlayToggle = document.getElementById('closeOnPlayToggle');
  const closeOnPlayInput = document.getElementById('closeOnPlayInput');

  if (closeOnPlayToggle && closeOnPlayInput) {
    closeOnPlayToggle.addEventListener('click', () => {
      closeOnPlayInput.checked = !closeOnPlayInput.checked;
      console.log(`[Settings] Close on play: ${closeOnPlayInput.checked ? 'ON' : 'OFF'}`);
      saveSetting('closeOnPlay', closeOnPlayInput.checked);
    });
  }
}

// Update slider value display
function updateSliderValue(slider, valueElement, unit, maxForUnlimited = null) {
  const value = parseInt(slider.value);
  let displayValue;

  if (unit === 'Mo') {
    displayValue = `${value} Mo`;
  } else if (unit === 'chunks') {
    displayValue = `${value} chunks`;
  } else if (unit === 'FPS') {
    displayValue = value === parseInt(maxForUnlimited) ? 'Illimité' : `${value} FPS`;
  } else {
    displayValue = value;
  }

  if (valueElement) {
    valueElement.textContent = displayValue;
  }

  // Save slider value
  const sliderId = slider.id;
  saveSetting(sliderId, value);

  console.log(`[Settings] ${unit} updated: ${displayValue}`);
}

// Settings management functions
function saveSetting(key, value) {
  try {
    const settings = loadSettings();
    settings[key] = value;
    localStorage.setItem('eminium-launcher-settings', JSON.stringify(settings));
    console.log(`[Settings] Saved ${key}: ${value}`);
  } catch (error) {
    console.error('[Settings] Error saving setting:', error);
  }
}

function loadSettings() {
  try {
    const settings = localStorage.getItem('eminium-launcher-settings');
    return settings ? JSON.parse(settings) : getDefaultSettings();
  } catch (error) {
    console.error('[Settings] Error loading settings:', error);
    return getDefaultSettings();
  }
}

function getDefaultSettings() {
  return {
    memSlider: 2048,
    renderSlider: 12,
    fpsSlider: 120,
    vsync: false,
    unlimitedFps: false,
    closeOnPlay: true
  };
}

function applySettingsToUI() {
  const settings = loadSettings();

  // Apply slider values
  const memSlider = document.getElementById('memSlider');
  const memValue = document.getElementById('memValue');
  if (memSlider && memValue && settings.memSlider) {
    memSlider.value = settings.memSlider;
    updateSliderValue(memSlider, memValue, 'Mo');
  }

  const renderSlider = document.getElementById('renderSlider');
  const renderValue = document.getElementById('renderValue');
  if (renderSlider && renderValue && settings.renderSlider) {
    renderSlider.value = settings.renderSlider;
    updateSliderValue(renderSlider, renderValue, 'chunks');
  }

  const fpsSlider = document.getElementById('fpsSlider');
  const fpsValue = document.getElementById('fpsValue');
  if (fpsSlider && fpsValue && settings.fpsSlider) {
    fpsSlider.value = settings.fpsSlider;
    updateSliderValue(fpsSlider, fpsValue, 'FPS', fpsSlider.max);
  }

  // Apply toggle values
  const vsyncInput = document.getElementById('vsyncInput');
  if (vsyncInput && settings.vsync !== undefined) {
    vsyncInput.checked = settings.vsync;
  }

  const unlimitedFpsInput = document.getElementById('unlimitedFpsInput');
  if (unlimitedFpsInput && settings.unlimitedFps !== undefined) {
    unlimitedFpsInput.checked = settings.unlimitedFps;
  }

  const closeOnPlayInput = document.getElementById('closeOnPlayInput');
  if (closeOnPlayInput && settings.closeOnPlay !== undefined) {
    closeOnPlayInput.checked = settings.closeOnPlay;
  }

  console.log('[Settings] Applied settings to UI');
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
  const settings = loadSettings();
  const memoryMB = settings.memSlider || 2048;
  const serverHost = 'play.eminium.ovh';
  const serverPort = 25565;

  try {
    window.ProgressUI.open('Lancement');
    window.ProgressUI.set(10);
    window.Logger.info(`Lancement de Minecraft... (RAM: ${memoryMB} Mo, ${serverHost}:${serverPort})`);

    // Prepare launch parameters
    const launchParams = {
      memoryMB: memoryMB,
      serverHost: serverHost,
      serverPort: serverPort
    };

    // Add graphics settings if available
    if (settings.vsync !== undefined) {
      launchParams.vsync = settings.vsync;
    }
    if (settings.unlimitedFps !== undefined) {
      launchParams.unlimitedFps = settings.unlimitedFps;
    }

    const res = await window.eminium.play(launchParams);

    if (res?.ok) {
      window.Logger.success('Client lancé ✓');
      window.ProgressUI.set(100);
      window.ProgressUI.addLine('Client lancé ✓');
      window.ProgressUI.enableClose();
      setTimeout(() => window.ProgressUI.close(), 1500);

      // Close launcher if setting is enabled
      if (settings.closeOnPlay) {
        setTimeout(() => {
          window.Logger.info('Fermeture du launcher...');
          // Note: In Electron, we would use window.close() or app.quit()
          console.log('[Launcher] Close on play enabled - would close window');
        }, 2000);
      }
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
