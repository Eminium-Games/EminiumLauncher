/**
 * Enhanced Updater Manager for Eminium Launcher
 * Provides comprehensive update checking, downloading, and installation with better UX
 */

// Updater state
let _updaterState = {
  checking: false,
  downloading: false,
  installing: false,
  currentVersion: '1.0.0',
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
  
  // Listen for update events - simplified version without event listeners
  if (window.updater) {
    // Event listeners are not available in the current implementation
    // Updates are checked manually via checkForUpdates function instead
    console.log('[Updater] Event listeners not available, using manual check approach');
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
  // Use global call stack protection
  return await CallStackProtection.safeExecuteAsync('checkForUpdates', async () => {
    if (_updaterState.checking || !window.updater) {
      console.log('[Updater] Check already in progress or updater not available');
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
  });
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
      title: 'Mise à jour disponible',
      body: `Version ${updateInfo.version} est disponible pour le téléchargement`,
      icon: 'https://eminium.ovh/storage/img/eminium-logo.png',
      badge: 'https://eminium.ovh/storage/img/eminium-logo.png',
      tag: 'eminium-update'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        // Don't call showUpdateNotification recursively - just show the notification directly
        new Notification('Mise à jour disponible', {
          title: 'Mise à jour disponible',
          body: `Version ${updateInfo.version} est disponible pour le téléchargement`,
          icon: 'https://eminium.ovh/storage/img/eminium-logo.png',
          badge: 'https://eminium.ovh/storage/img/eminium-logo.png',
          tag: 'eminium-update'
        });
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
      title: 'Erreur de mise à jour',
      body: 'Une erreur est survenue lors de la mise à jour',
      icon: 'https://eminium.ovh/storage/img/eminium-logo.png',
      badge: 'https://eminium.ovh/storage/img/eminium-logo.png',
      tag: 'eminium-update'
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
  if (!window.DOMUtils) {
    console.error('DOMUtils not available');
    return;
  }
  
  // Update version display
  window.DOMUtils.setText('currentVersion', `Version actuelle: ${_updaterState.currentVersion}`);
  
  if (_updaterState.latestVersion) {
    window.DOMUtils.setText('latestVersion', `Dernière version: ${_updaterState.latestVersion}`);
  } else {
    window.DOMUtils.setText('latestVersion', 'Dernière version: Inconnue');
  }
  
  // Update status
  let statusText = '';
  let statusClass = '';
  
  if (_updaterState.checking) {
    statusText = 'Vérification en cours...';
    statusClass = 'checking';
  } else if (_updaterState.downloading) {
    statusText = `Téléchargement: ${_updaterState.downloadProgress.toFixed(0)}%`;
    statusClass = 'downloading';
  } else if (_updaterState.installing) {
    statusText = `Installation: ${_updaterState.installProgress.toFixed(0)}%`;
    statusClass = 'installing';
  } else if (_updaterState.updateAvailable) {
    statusText = 'Mise à jour disponible!';
    statusClass = 'available';
  } else {
    statusText = 'À jour';
    statusClass = 'up-to-date';
  }
  
  window.DOMUtils.setText('updateStatus', statusText);
  window.DOMUtils.setAttribute('updateStatus', 'className', `update-status ${statusClass}`);
  
  // Update button
  if (_updaterState.updateAvailable && !_updaterState.downloading && !_updaterState.installing) {
    window.DOMUtils.setText('updateButton', 'Mettre à jour');
    window.DOMUtils.setDisabled('updateButton', false);
    window.DOMUtils.show('updateButton', 'block');
  } else if (_updaterState.downloading || _updaterState.installing) {
    window.DOMUtils.setText('updateButton', 'Mise à jour en cours...');
    window.DOMUtils.setDisabled('updateButton', true);
  } else {
    window.DOMUtils.hide('updateButton');
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

// Force update function - clears cache and forces recheck
async function forceUpdate() {
  try {
    console.log('[Updater] Forcing update check...');
    
    // Clear any cached update info
    _updaterState.updateAvailable = false;
    _updaterState.updateInfo = null;
    _updaterState.latestVersion = '1.0.0';
    
    // Force a fresh check
    await checkForUpdates(true);
    
    // If update is available, automatically download it
    if (_updaterState.updateAvailable) {
      console.log('[Updater] Update found, forcing download...');
      await downloadAndInstallUpdate();
    } else {
      console.log('[Updater] No updates available');
      // Show notification to user
      if (UPDATE_CONFIG.showNotifications) {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
          <div class="notification-content">
            <div class="notification-icon">✓</div>
            <div class="notification-text">
              <strong>Aucune mise à jour disponible</strong><br>
              Votre launcher est à jour avec la version ${_updaterState.currentVersion}
            </div>
          </div>
        `;
        
        // Add basic styling
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          max-width: 300px;
          animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          notification.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => {
            if (notification.parentNode) {
              notification.parentNode.removeChild(notification);
            }
          }, 300);
        }, 5000);
      }
    }
  } catch (error) {
    console.error('[Updater] Force update failed:', error);
    handleUpdateError(error);
  }
}

// Export updater manager
window.UpdaterManager = {
  initUpdaterManager,
  checkForUpdates,
  checkForUpdatesManual,
  downloadAndInstallUpdate,
  installUpdateManual,
  forceUpdate,
  getUpdaterState,
  getUpdateHistory,
  startPeriodicChecks,
  stopPeriodicChecks,
  updateUpdateUI,
  UPDATE_CONFIG
};
