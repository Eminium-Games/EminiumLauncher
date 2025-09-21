/**
 * Enhanced Updater Manager for Eminium Launcher
 * Provides comprehensive update checking, downloading, and installation with better UX
 */

// Updater state
let _updaterState = {
  checking: false,
  downloading: false,
  installing: false,
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  updateInfo: null,
  downloadProgress: 0,
  installProgress: 0,
  lastCheck: null,
  autoCheckEnabled: true,
  checkInterval: null,
  updateHistory: []
};

// Update configuration
const UPDATE_CONFIG = {
  autoCheckInterval: 30 * 60 * 1000, // 30 minutes
  checkOnStartup: true,
  checkOnNetworkChange: true,
  maxRetries: 3,
  retryDelay: 5000,
  showNotifications: true,
  allowPrerelease: false,
  backupBeforeUpdate: true
};

// Initialize updater manager
async function initUpdaterManager() {
  try {
    console.log('[Updater] Initializing updater manager...');
    
    // Get current version
    if (window.eminium && window.eminium.getVersion) {
      const versionInfo = await window.eminium.getVersion();
      _updaterState.currentVersion = versionInfo.version || '1.0.0';
    } else {
      _updaterState.currentVersion = '1.0.0';
    }
    
    console.log('[Updater] Current version:', _updaterState.currentVersion);
    
    // Set up event listeners
    setupUpdaterEventListeners();
    
    // Check for updates on startup if enabled
    if (UPDATE_CONFIG.checkOnStartup) {
      setTimeout(() => checkForUpdates(false), 3000); // Wait 3 seconds after startup
    }
    
    // Set up periodic checks
    if (UPDATE_CONFIG.autoCheckEnabled) {
      startPeriodicChecks();
    }
    
    // Listen for network changes
    if (UPDATE_CONFIG.checkOnNetworkChange) {
      window.addEventListener('online', () => {
        console.log('[Updater] Network online, checking for updates...');
        checkForUpdates(false);
      });
    }
    
    // Load update history
    loadUpdateHistory();
    
    console.log('[Updater] Updater manager initialized successfully');
    
  } catch (error) {
    console.error('[Updater] Failed to initialize updater manager:', error);
  }
}

// Set up updater event listeners
function setupUpdaterEventListeners() {
  // Listen for progress updates from main process
  if (window.updater) {
    window.updater.onProgress((data) => {
      handleUpdateProgress(data);
    });
  }
  
  // Listen for update events
  if (window.updater) {
    window.updater.onUpdateAvailable((info) => {
      console.log('[Updater] Update available:', info);
      _updaterState.updateAvailable = true;
      _updaterState.updateInfo = info;
      _updaterState.latestVersion = info.version;
      
      // Show notification if enabled
      if (UPDATE_CONFIG.showNotifications) {
        showUpdateNotification(info);
      }
      
      // Update UI
      updateUpdateUI();
    });
    
    window.updater.onUpdateNotAvailable(() => {
      console.log('[Updater] No updates available');
      _updaterState.updateAvailable = false;
      updateUpdateUI();
    });
    
    window.updater.onUpdateError((error) => {
      console.error('[Updater] Update error:', error);
      handleUpdateError(error);
    });
  }
}

// Handle update progress
function handleUpdateProgress(data) {
  if (!data) return;
  
  console.log('[Updater] Progress update:', data);
  
  switch (data.phase) {
    case 'checking':
      _updaterState.checking = true;
      window.ProgressUI.addLine('Vérification des mises à jour...');
      break;
      
    case 'downloading':
      _updaterState.downloading = true;
      _updaterState.checking = false;
      _updaterState.downloadProgress = data.percent || 0;
      
      const curr = data.currentFile || 1;
      const total = data.totalFiles || 1;
      const p = typeof data.percent === 'number' ? data.percent : 0;
      
      window.ProgressUI.set(Math.max(1, Math.min(100, p | 0)));
      window.ProgressUI.addLine(`Téléchargement des mises à jour ${curr}/${total}`);
      
      // Update download speed if available
      if (data.speed) {
        window.ProgressUI.addLine(`Vitesse: ${data.speed.toFixed(1)} MB/s`, 'debug');
      }
      
      // Update ETA if available
      if (data.eta) {
        const minutes = Math.floor(data.eta / 60);
        const seconds = Math.floor(data.eta % 60);
        window.ProgressUI.addLine(`Temps restant: ${minutes}:${seconds.toString().padStart(2, '0')}`, 'debug');
      }
      break;
      
    case 'downloaded':
      _updaterState.downloading = false;
      _updaterState.downloadProgress = 100;
      window.ProgressUI.set(100);
      window.ProgressUI.addLine('Téléchargement terminé ✓');
      window.ProgressUI.addLine('Préparation de l\'installation...');
      break;
      
    case 'installing':
      _updaterState.installing = true;
      _updaterState.downloadProgress = 100;
      
      const installCurr = data.currentFile || 0;
      const installTotal = data.totalFiles || 0;
      
      if (installTotal > 0) {
        _updaterState.installProgress = Math.round((installCurr / installTotal) * 100);
        window.ProgressUI.set(_updaterState.installProgress);
        window.ProgressUI.addLine(`Installation ${installCurr}/${installTotal}`);
      }
      break;
      
    case 'installed':
      _updaterState.installing = false;
      _updaterState.installProgress = 100;
      window.ProgressUI.set(100);
      window.ProgressUI.addLine('Mise à jour installée ✓');
      
      // Add to update history
      addToUpdateHistory({
        version: _updaterState.latestVersion,
        date: new Date().toISOString(),
        success: true
      });
      
      break;
      
    case 'error':
      _updaterState.checking = false;
      _updaterState.downloading = false;
      _updaterState.installing = false;
      
      window.ProgressUI.addLine('Erreur de mise à jour: ' + (data.message || 'inconnue'), 'error');
      window.ProgressUI.enableClose();
      
      handleUpdateError(data);
      break;
  }
  
  updateUpdateUI();
}

// Check for updates
async function checkForUpdates(showProgress = true) {
  if (_updaterState.checking || !window.updater) {
    return { ok: false, error: 'Updater not available or already checking' };
  }
  
  try {
    _updaterState.checking = true;
    _updaterState.lastCheck = new Date();
    
    console.log('[Updater] Checking for updates...');
    
    if (showProgress) {
      window.ProgressUI.open('Vérification des mises à jour');
      window.ProgressUI.set(10);
      window.ProgressUI.addLine('Recherche de mises à jour...');
    }
    
    const result = await window.updater.check({
      allowPrerelease: UPDATE_CONFIG.allowPrerelease
    });
    
    _updaterState.checking = false;
    
    if (showProgress) {
      window.ProgressUI.set(100);
      window.ProgressUI.enableClose();
      setTimeout(() => window.ProgressUI.close(), 1500);
    }
    
    if (result?.ok) {
      if (result.updateAvailable) {
        console.log('[Updater] Update available:', result.latest);
        _updaterState.updateAvailable = true;
        _updaterState.updateInfo = result.latest;
        _updaterState.latestVersion = result.latest.version;
        
        if (showProgress) {
          window.ProgressUI.addLine(`Nouvelle version disponible: ${result.latest.version}`);
        }
        
        // Show notification
        if (UPDATE_CONFIG.showNotifications) {
          showUpdateNotification(result.latest);
        }
      } else {
        console.log('[Updater] No updates available');
        _updaterState.updateAvailable = false;
        
        if (showProgress) {
          window.ProgressUI.addLine('Aucune mise à jour disponible');
        }
      }
    } else {
      throw new Error(result?.error || 'Failed to check for updates');
    }
    
    updateUpdateUI();
    return result;
    
  } catch (error) {
    _updaterState.checking = false;
    
    console.error('[Updater] Error checking for updates:', error);
    
    if (showProgress) {
      window.ProgressUI.addLine('Erreur lors de la vérification: ' + error.message, 'error');
      window.ProgressUI.enableClose();
    }
    
    return { ok: false, error: error.message };
  }
}

// Download and install update
async function downloadAndInstallUpdate() {
  if (!_updaterState.updateAvailable || !window.updater) {
    return { ok: false, error: 'No update available or updater not ready' };
  }
  
  try {
    window.ProgressUI.open('Mise à jour du launcher');
    window.ProgressUI.set(5);
    window.ProgressUI.addLine('Préparation du téléchargement...');
    
    // Create backup if enabled
    if (UPDATE_CONFIG.backupBeforeUpdate) {
      window.ProgressUI.addLine('Création d\'une sauvegarde...');
      // Backup logic would be implemented here
    }
    
    // Download update
    window.ProgressUI.addLine('Téléchargement de la mise à jour...');
    const downloadResult = await window.updater.download({
      assetUrl: _updaterState.updateInfo.assetUrl,
      tag: _updaterState.updateInfo.tag,
      version: _updaterState.latestVersion
    });
    
    if (!downloadResult?.ok) {
      throw new Error(downloadResult?.error || 'Failed to download update');
    }
    
    window.ProgressUI.addLine('Téléchargement terminé ✓');
    
    // Install update
    window.ProgressUI.addLine('Installation de la mise à jour...');
    const installResult = await window.updater.apply({
      tag: _updaterState.updateInfo.tag,
      version: _updaterState.latestVersion
    });
    
    if (!installResult?.ok) {
      throw new Error(installResult?.error || 'Failed to install update');
    }
    
    window.ProgressUI.addLine('Mise à jour appliquée ✓');
    window.ProgressUI.addLine('Redémarrage du launcher...');
    window.ProgressUI.set(100);
    
    // Add to update history
    addToUpdateHistory({
      version: _updaterState.latestVersion,
      date: new Date().toISOString(),
      success: true
    });
    
    // Relaunch after a short delay
    setTimeout(async () => {
      try {
        await window.updater.relaunch();
      } catch (error) {
        console.error('[Updater] Error relaunching:', error);
        window.ProgressUI.addLine('Erreur lors du redémarrage', 'error');
        window.ProgressUI.enableClose();
      }
    }, 2000);
    
    return { ok: true };
    
  } catch (error) {
    console.error('[Updater] Error downloading/installing update:', error);
    
    window.ProgressUI.addLine('Erreur: ' + error.message, 'error');
    window.ProgressUI.enableClose();
    
    // Add to update history as failed
    addToUpdateHistory({
      version: _updaterState.latestVersion,
      date: new Date().toISOString(),
      success: false,
      error: error.message
    });
    
    return { ok: false, error: error.message };
  }
}

// Show update notification
function showUpdateNotification(updateInfo) {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    new Notification('Mise à jour disponible', {
      body: `Version ${updateInfo.version} est disponible pour le téléchargement`,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: 'eminium-update'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showUpdateNotification(updateInfo);
      }
    });
  }
}

// Handle update error
function handleUpdateError(error) {
  console.error('[Updater] Update error:', error);
  
  // Add to update history as failed
  addToUpdateHistory({
    version: _updaterState.latestVersion,
    date: new Date().toISOString(),
    success: false,
    error: error.message || 'Unknown error'
  });
  
  // Show error notification if enabled
  if (UPDATE_CONFIG.showNotifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Erreur de mise à jour', {
      body: 'Une erreur est survenue lors de la mise à jour',
      icon: '/icon.png'
    });
  }
}

// Start periodic update checks
function startPeriodicChecks() {
  if (_updaterState.checkInterval) {
    clearInterval(_updaterState.checkInterval);
  }
  
  _updaterState.checkInterval = setInterval(() => {
    checkForUpdates(false);
  }, UPDATE_CONFIG.autoCheckInterval);
  
  console.log('[Updater] Periodic checks started');
}

// Stop periodic update checks
function stopPeriodicChecks() {
  if (_updaterState.checkInterval) {
    clearInterval(_updaterState.checkInterval);
    _updaterState.checkInterval = null;
    console.log('[Updater] Periodic checks stopped');
  }
}

// Update update UI elements
function updateUpdateUI() {
  const updateStatus = document.getElementById('updateStatus');
  const updateButton = document.getElementById('updateButton');
  const currentVersionEl = document.getElementById('currentVersion');
  const latestVersionEl = document.getElementById('latestVersion');
  
  // Update version display
  if (currentVersionEl) {
    currentVersionEl.textContent = `Version actuelle: ${_updaterState.currentVersion}`;
  }
  
  if (latestVersionEl) {
    if (_updaterState.latestVersion) {
      latestVersionEl.textContent = `Dernière version: ${_updaterState.latestVersion}`;
    } else {
      latestVersionEl.textContent = 'Dernière version: Inconnue';
    }
  }
  
  // Update status
  if (updateStatus) {
    if (_updaterState.checking) {
      updateStatus.textContent = 'Vérification en cours...';
      updateStatus.className = 'update-status checking';
    } else if (_updaterState.downloading) {
      updateStatus.textContent = `Téléchargement: ${_updaterState.downloadProgress.toFixed(0)}%`;
      updateStatus.className = 'update-status downloading';
    } else if (_updaterState.installing) {
      updateStatus.textContent = `Installation: ${_updaterState.installProgress.toFixed(0)}%`;
      updateStatus.className = 'update-status installing';
    } else if (_updaterState.updateAvailable) {
      updateStatus.textContent = 'Mise à jour disponible!';
      updateStatus.className = 'update-status available';
    } else {
      updateStatus.textContent = 'À jour';
      updateStatus.className = 'update-status up-to-date';
    }
  }
  
  // Update button
  if (updateButton) {
    if (_updaterState.updateAvailable && !_updaterState.downloading && !_updaterState.installing) {
      updateButton.style.display = 'block';
      updateButton.disabled = false;
      updateButton.textContent = 'Mettre à jour';
    } else if (_updaterState.downloading || _updaterState.installing) {
      updateButton.disabled = true;
      updateButton.textContent = 'Mise à jour en cours...';
    } else {
      updateButton.style.display = 'none';
    }
  }
}

// Load update history
function loadUpdateHistory() {
  try {
    const saved = localStorage.getItem('eminium_update_history');
    if (saved) {
      _updaterState.updateHistory = JSON.parse(saved);
    }
  } catch (error) {
    console.warn('[Updater] Failed to load update history:', error);
  }
}

// Add to update history
function addToUpdateHistory(entry) {
  _updaterState.updateHistory.unshift(entry);
  
  // Keep only last 10 entries
  if (_updaterState.updateHistory.length > 10) {
    _updaterState.updateHistory = _updaterState.updateHistory.slice(0, 10);
  }
  
  // Save to localStorage
  try {
    localStorage.setItem('eminium_update_history', JSON.stringify(_updaterState.updateHistory));
  } catch (error) {
    console.warn('[Updater] Failed to save update history:', error);
  }
}

// Get update history
function getUpdateHistory() {
  return [..._updaterState.updateHistory];
}

// Get updater state
function getUpdaterState() {
  return { ..._updaterState };
}

// Check for updates manually (user initiated)
async function checkForUpdatesManual() {
  return await checkForUpdates(true);
}

// Install update manually (user initiated)
async function installUpdateManual() {
  return await downloadAndInstallUpdate();
}

// Export updater manager
window.UpdaterManager = {
  initUpdaterManager,
  checkForUpdates,
  checkForUpdatesManual,
  downloadAndInstallUpdate,
  installUpdateManual,
  getUpdaterState,
  getUpdateHistory,
  startPeriodicChecks,
  stopPeriodicChecks,
  updateUpdateUI,
  UPDATE_CONFIG
};
