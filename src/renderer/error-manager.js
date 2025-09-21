/**
 * Enhanced Error Manager for Eminium Launcher
 * Provides comprehensive error handling and user-friendly messages
 */

// Error types and categories
const ErrorTypes = {
  NETWORK: 'network',
  AUTH: 'auth',
  FILESYSTEM: 'filesystem',
  UPDATE: 'update',
  GAME_LAUNCH: 'game_launch',
  SETTINGS: 'settings',
  UNKNOWN: 'unknown'
};

// Error severity levels
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error state
let _errorState = {
  errorHistory: [],
  currentError: null,
  errorCount: 0,
  lastErrorTime: null
};

// User-friendly error messages
const ErrorMessages = {
  [ErrorTypes.NETWORK]: {
    [ErrorSeverity.LOW]: 'Problème de connexion réseau détecté',
    [ErrorSeverity.MEDIUM]: 'Impossible de se connecter au serveur',
    [ErrorSeverity.HIGH]: 'Erreur réseau critique - vérifiez votre connexion',
    [ErrorSeverity.CRITICAL]: 'Connexion réseau perdue - application indisponible'
  },
  [ErrorTypes.AUTH]: {
    [ErrorSeverity.LOW]: 'Problème d\'authentification mineur',
    [ErrorSeverity.MEDIUM]: 'Échec de l\'authentification - vérifiez vos identifiants',
    [ErrorSeverity.HIGH]: 'Erreur d\'authentification critique',
    [ErrorSeverity.CRITICAL]: 'Session expirée - veuillez vous reconnecter'
  },
  [ErrorTypes.FILESYSTEM]: {
    [ErrorSeverity.LOW]: 'Problème d\'accès aux fichiers',
    [ErrorSeverity.MEDIUM]: 'Impossible de lire/écrire les fichiers nécessaires',
    [ErrorSeverity.HIGH]: 'Erreur critique du système de fichiers',
    [ErrorSeverity.CRITICAL]: 'Permissions insuffisantes - contactez l\'administrateur'
  },
  [ErrorTypes.UPDATE]: {
    [ErrorSeverity.LOW]: 'Problème de mise à jour mineur',
    [ErrorSeverity.MEDIUM]: 'Échec de la mise à jour - réessayez plus tard',
    [ErrorSeverity.HIGH]: 'Erreur critique de mise à jour',
    [ErrorSeverity.CRITICAL]: 'Mise à jour corrompue - réinstallation nécessaire'
  },
  [ErrorTypes.GAME_LAUNCH]: {
    [ErrorSeverity.LOW]: 'Problème mineur au lancement du jeu',
    [ErrorSeverity.MEDIUM]: 'Impossible de lancer le jeu - vérifiez les paramètres',
    [ErrorSeverity.HIGH]: 'Erreur critique au lancement du jeu',
    [ErrorSeverity.CRITICAL]: 'Fichiers de jeu corrompus - réinstallation nécessaire'
  },
  [ErrorTypes.SETTINGS]: {
    [ErrorSeverity.LOW]: 'Problème mineur avec les paramètres',
    [ErrorSeverity.MEDIUM]: 'Impossible de sauvegarder les paramètres',
    [ErrorSeverity.HIGH]: 'Erreur critique des paramètres',
    [ErrorSeverity.CRITICAL]: 'Paramètres corrompus - réinitialisation nécessaire'
  },
  [ErrorTypes.UNKNOWN]: {
    [ErrorSeverity.LOW]: 'Erreur inconnue mineure',
    [ErrorSeverity.MEDIUM]: 'Une erreur inattendue s\'est produite',
    [ErrorSeverity.HIGH]: 'Erreur inconnue critique',
    [ErrorSeverity.CRITICAL]: 'Erreur système critique - redémarrez l\'application'
  }
};

// Error solutions
const ErrorSolutions = {
  [ErrorTypes.NETWORK]: [
    'Vérifiez votre connexion internet',
    'Redémarrez votre routeur',
    'Vérifiez les paramètres du pare-feu',
    'Contactez votre administrateur réseau'
  ],
  [ErrorTypes.AUTH]: [
    'Vérifiez vos identifiants',
    'Réinitialisez votre mot de passe',
    'Vérifiez votre connexion internet',
    'Contactez le support technique'
  ],
  [ErrorTypes.FILESYSTEM]: [
    'Vérifiez les permissions du dossier',
    'Libérez de l\'espace disque',
    'Exécutez l\'application en tant qu\'administrateur',
    'Vérifiez l\'antivirus'
  ],
  [ErrorTypes.UPDATE]: [
    'Réessayez la mise à jour plus tard',
    'Téléchargez manuellement la mise à jour',
    'Redémarrez l\'application',
    'Réinstallez l\'application'
  ],
  [ErrorTypes.GAME_LAUNCH]: [
    'Vérifiez les paramètres de jeu',
    'Libérez de la mémoire RAM',
    'Mettez à jour vos pilotes graphiques',
    'Vérifiez l\'intégrité des fichiers'
  ],
  [ErrorTypes.SETTINGS]: [
    'Réinitialisez les paramètres par défaut',
    'Redémarrez l\'application',
    'Vérifiez les permissions du dossier',
    'Contactez le support technique'
  ],
  [ErrorTypes.UNKNOWN]: [
    'Redémarrez l\'application',
    'Vérifiez les logs système',
    'Mettez à jour l\'application',
    'Contactez le support technique'
  ]
};

// Categorize error based on error message or type
function categorizeError(error) {
  const errorMessage = error?.message?.toLowerCase() || error?.toLowerCase() || '';
  const errorType = error?.type?.toLowerCase() || '';
  
  if (errorMessage.includes('network') || errorMessage.includes('connection') || 
      errorMessage.includes('timeout') || errorMessage.includes('ping') ||
      errorType.includes('network')) {
    return ErrorTypes.NETWORK;
  }
  
  if (errorMessage.includes('auth') || errorMessage.includes('login') || 
      errorMessage.includes('credential') || errorMessage.includes('token') ||
      errorType.includes('auth')) {
    return ErrorTypes.AUTH;
  }
  
  if (errorMessage.includes('file') || errorMessage.includes('filesystem') || 
      errorMessage.includes('permission') || errorMessage.includes('access') ||
      errorType.includes('filesystem')) {
    return ErrorTypes.FILESYSTEM;
  }
  
  if (errorMessage.includes('update') || errorMessage.includes('download') || 
      errorMessage.includes('install') || errorType.includes('update')) {
    return ErrorTypes.UPDATE;
  }
  
  if (errorMessage.includes('launch') || errorMessage.includes('minecraft') || 
      errorMessage.includes('game') || errorType.includes('game')) {
    return ErrorTypes.GAME_LAUNCH;
  }
  
  if (errorMessage.includes('setting') || errorMessage.includes('config') || 
      errorType.includes('setting')) {
    return ErrorTypes.SETTINGS;
  }
  
  return ErrorTypes.UNKNOWN;
}

// Determine error severity
function determineSeverity(error, errorType) {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  // Critical errors
  if (errorMessage.includes('critical') || errorMessage.includes('fatal') || 
      errorMessage.includes('corrupt') || errorMessage.includes('permission denied')) {
    return ErrorSeverity.CRITICAL;
  }
  
  // High severity errors
  if (errorMessage.includes('failed') || errorMessage.includes('error') || 
      errorMessage.includes('exception') || errorMessage.includes('timeout')) {
    return ErrorSeverity.HIGH;
  }
  
  // Medium severity errors
  if (errorMessage.includes('warning') || errorMessage.includes('warn') || 
      errorMessage.includes('retry')) {
    return ErrorSeverity.MEDIUM;
  }
  
  // Default to low severity
  return ErrorSeverity.LOW;
}

// Create error notification
function createErrorNotification(error, errorType, severity) {
  const notification = document.createElement('div');
  notification.className = `error-notification error-${severity}`;
  
  const message = ErrorMessages[errorType][severity];
  const solutions = ErrorSolutions[errorType];
  
  notification.innerHTML = `
    <div class="error-header">
      <div class="error-icon">⚠️</div>
      <div class="error-title">
        <strong>Erreur ${severity.toUpperCase()}</strong>
        <div class="error-message">${message}</div>
      </div>
      <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
    <div class="error-details">
      <div class="error-technical">
        <strong>Détails techniques:</strong>
        <code>${error?.message || error || 'Erreur inconnue'}</code>
      </div>
      <div class="error-solutions">
        <strong>Solutions possibles:</strong>
        <ul>
          ${solutions.slice(0, 3).map(solution => `<li>${solution}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="error-actions">
      <button class="btn btn-primary" onclick="ErrorManager.retryLastAction()">Réessayer</button>
      <button class="btn btn-secondary" onclick="ErrorManager.showErrorDetails()">Détails</button>
    </div>
  `;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    backdrop-filter: blur(10px);
  `;
  
  // Add severity-specific colors
  const severityColors = {
    [ErrorSeverity.LOW]: 'border-left: 4px solid #fbbf24;',
    [ErrorSeverity.MEDIUM]: 'border-left: 4px solid #f97316;',
    [ErrorSeverity.HIGH]: 'border-left: 4px solid #ef4444;',
    [ErrorSeverity.CRITICAL]: 'border-left: 4px solid #dc2626;'
  };
  
  notification.style.cssText += severityColors[severity];
  
  document.body.appendChild(notification);
  
  // Auto-remove after 10 seconds for low/medium, 15 for high/critical
  const autoRemoveTime = severity === ErrorSeverity.LOW || severity === ErrorSeverity.MEDIUM ? 10000 : 15000;
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, autoRemoveTime);
  
  return notification;
}

// Global protection against stack overflow and recursive calls
const CallStackProtection = {
  _activeCalls: new Map(),
  _maxStackDepth: 50,
  _currentStackDepth: 0,
  _functionTimeouts: new Map(),
  _maxExecutionTime: 30000, // 30 seconds max per function
  _callCounts: new Map(),
  _lastActivity: new Map(),
  _monitoredFunctions: new Map(),
  _protectionActive: true,
  _maxIdleTime: 300000, // 5 minutes max idle time

  // Execute a function safely with stack protection
  safeExecute: function(functionName, fn, ...args) {
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      console.error(`[CallStackProtection] Function ${functionName} timed out after ${this._maxExecutionTime}ms`);
      this._forceCleanup(functionName);
    }, this._maxExecutionTime);

    this._functionTimeouts.set(functionName, timeoutId);

    const callId = `${functionName}_${Date.now()}_${Math.random()}`;

    // Check if we're in a recursive loop
    if (this._activeCalls.has(functionName)) {
      const callCount = this._activeCalls.get(functionName);
      if (callCount > 5) { // Max 5 simultaneous calls per function
        console.warn(`[CallStackProtection] Blocking recursive call to ${functionName} (${callCount} active calls)`);
        clearTimeout(timeoutId);
        this._functionTimeouts.delete(functionName);
        return null;
      }
      this._activeCalls.set(functionName, callCount + 1);
    } else {
      this._activeCalls.set(functionName, 1);
    }

    // Check stack depth
    this._currentStackDepth++;
    if (this._currentStackDepth > this._maxStackDepth) {
      this._currentStackDepth--;
      const callCount = this._activeCalls.get(functionName) || 1;
      this._activeCalls.set(functionName, callCount - 1);
      if (callCount <= 1) this._activeCalls.delete(functionName);
      clearTimeout(timeoutId);
      this._functionTimeouts.delete(functionName);
      console.warn(`[CallStackProtection] Maximum stack depth exceeded for ${functionName}`);
      return null;
    }

    try {
      const result = fn(...args);
      return result;
    } catch (error) {
      console.error(`[CallStackProtection] Error in ${functionName}:`, error);
      return null;
    } finally {
      this._currentStackDepth--;
      const callCount = this._activeCalls.get(functionName) || 1;
      this._activeCalls.set(functionName, callCount - 1);
      if (callCount <= 1) this._activeCalls.delete(functionName);
      clearTimeout(timeoutId);
      this._functionTimeouts.delete(functionName);
    }
  },

  // Safe async execution
  safeExecuteAsync: async function(functionName, fn, ...args) {
    // Check if we're in a recursive loop
    if (this._activeCalls.has(functionName)) {
      const callCount = this._activeCalls.get(functionName);
      if (callCount > 3) { // Max 3 simultaneous async calls per function
        console.warn(`[CallStackProtection] Blocking recursive async call to ${functionName} (${callCount} active calls)`);
        return null;
      }
      this._activeCalls.set(functionName, callCount + 1);
    } else {
      this._activeCalls.set(functionName, 1);
    }

    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      console.error(`[CallStackProtection] Async error in ${functionName}:`, error);
      return null;
    } finally {
      const callCount = this._activeCalls.get(functionName) || 1;
      this._activeCalls.set(functionName, callCount - 1);
      if (callCount <= 1) this._activeCalls.delete(functionName);
    }
  },

  // Force reset a stuck function
  _forceResetFunction: function(functionName) {
    console.error(`[CallStackProtection] Force resetting ${functionName}`);

    // Reset global state
    if (functionName === 'ensureAll') {
      if (globalThis._ensureAllInProgress) {
        globalThis._ensureAllInProgress = false;
        console.log(`[CallStackProtection] Reset ensureAll state`);
      }
    }

    if (functionName === 'checkForUpdates') {
      if (typeof window !== 'undefined' && window.UpdaterManager) {
        const updaterState = window.UpdaterManager.getUpdaterState();
        if (updaterState.checking) {
          console.log(`[CallStackProtection] Reset checkForUpdates state`);
          // The function will be reset by the call stack protection timeout
        }
      }
    }

    // Remove from activity tracking
    this._lastActivity.delete(functionName);
  },

  // Start monitoring
  startMonitoring: function() {
    if (!this._protectionActive) return;

    // Check for stuck functions every 30 seconds
    setInterval(() => {
      this.checkForStuckFunctions();
    }, 30000);

    console.log(`[CallStackProtection] Started monitoring ${this._monitoredFunctions.size} functions`);
  },

  // Stop monitoring
  stopMonitoring: function() {
    this._protectionActive = false;
    console.log('[CallStackProtection] Stopped monitoring');
  },

  // Get status
  getStatus: function() {
    const now = Date.now();
    const status = {
      monitoredFunctions: Array.from(this._monitoredFunctions),
      active: this._protectionActive,
      lastActivities: {}
    };

    for (const [functionName, lastActivity] of this._lastActivity) {
      status.lastActivities[functionName] = {
        lastActivity: lastActivity,
        timeSinceActivity: now - lastActivity,
        isStuck: (now - lastActivity) > this._maxIdleTime
      };
    }

    return status;
  }
};

// Initialize stack overflow protection
if (typeof window !== 'undefined') {
  window.CallStackProtection = CallStackProtection;
  // Start monitoring when the window loads
  window.addEventListener('load', () => {
    setTimeout(() => {
      CallStackProtection.startMonitoring();
    }, 5000); // Wait 5 seconds after page load
  });
}
if (typeof global !== 'undefined') {
  global.CallStackProtection = CallStackProtection;
}

// Handle error with enhanced processing
function handleError(error, context = '') {
  try {
    const errorType = categorizeError(error);
    const severity = determineSeverity(error, errorType);
    const timestamp = new Date().toISOString();
    
    // Create error object
    const errorObj = {
      id: Date.now() + Math.random(),
      type: errorType,
      severity: severity,
      message: error?.message || error || 'Erreur inconnue',
      context: context,
      timestamp: timestamp,
      stack: error?.stack || null
    };
    
    // Update error state
    _errorState.currentError = errorObj;
    _errorState.errorHistory.push(errorObj);
    _errorState.errorCount++;
    _errorState.lastErrorTime = timestamp;
    
    // Keep only last 50 errors in history
    if (_errorState.errorHistory.length > 50) {
      _errorState.errorHistory = _errorState.errorHistory.slice(-50);
    }
    
    // Log error
    console.error(`[${errorType.toUpperCase()}] ${context}:`, error);
    
    // Show user-friendly notification
    createErrorNotification(error, errorType, severity);
    
    // Log to external service if available
    if (window.Logger) {
      window.Logger.error(`[${errorType.toUpperCase()}] ${context}: ${errorObj.message}`);
    }
    
    return errorObj;
  } catch (handlingError) {
    console.error('Error in error handler:', handlingError);
    // Fallback to basic error display
    alert('Une erreur est survenue: ' + (error?.message || error));
  }
}

// Retry last action
function retryLastAction() {
  if (_errorState.currentError) {
    const { context } = _errorState.currentError;
    
    // Remove all error notifications
    document.querySelectorAll('.error-notification').forEach(notification => {
      notification.remove();
    });
    
    // Retry based on context
    switch (context) {
      case 'auto-start':
        if (window.app && window.app.autoStartFlow) {
          window.app.autoStartFlow();
        }
        break;
      case 'checkAndAutoPrepare':
        if (window.app && window.app.checkAndAutoPrepare) {
          window.app.checkAndAutoPrepare();
        }
        break;
      case 'launchGame':
        if (window.app && window.app.launchGame) {
          window.app.launchGame();
        }
        break;
      case 'update':
        if (window.UpdaterManager && window.UpdaterManager.checkForUpdates) {
          window.UpdaterManager.checkForUpdates(true);
        }
        break;
      default:
        console.log('Retry not implemented for context:', context);
    }
  }
}

// Show error details modal
function showErrorDetails() {
  if (!_errorState.currentError) return;
  
  const modal = document.createElement('div');
  modal.className = 'error-details-modal';
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Détails de l'erreur</h3>
          <button class="modal-close" onclick="this.closest('.error-details-modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="error-info">
            <p><strong>Type:</strong> ${_errorState.currentError.type}</p>
            <p><strong>Sévérité:</strong> ${_errorState.currentError.severity}</p>
            <p><strong>Contexte:</strong> ${_errorState.currentError.context}</p>
            <p><strong>Timestamp:</strong> ${new Date(_errorState.currentError.timestamp).toLocaleString()}</p>
          </div>
          <div class="error-message">
            <strong>Message:</strong>
            <pre>${_errorState.currentError.message}</pre>
          </div>
          ${_errorState.currentError.stack ? `
            <div class="error-stack">
              <strong>Stack trace:</strong>
              <pre>${_errorState.currentError.stack}</pre>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="ErrorManager.copyErrorDetails()">Copier</button>
          <button class="btn btn-secondary" onclick="this.closest('.error-details-modal').remove()">Fermer</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Copy error details to clipboard
function copyErrorDetails() {
  if (!_errorState.currentError) return;
  
  const details = `
Type: ${_errorState.currentError.type}
Severity: ${_errorState.currentError.severity}
Context: ${_errorState.currentError.context}
Timestamp: ${new Date(_errorState.currentError.timestamp).toLocaleString()}
Message: ${_errorState.currentError.message}
${_errorState.currentError.stack ? `Stack: ${_errorState.currentError.stack}` : ''}
  `.trim();
  
  navigator.clipboard.writeText(details).then(() => {
    alert('Détails de l\'erreur copiés dans le presse-papiers');
  }).catch(() => {
    alert('Impossible de copier les détails de l\'erreur');
  });
}

// Get error statistics
function getErrorStats() {
  const stats = {
    totalErrors: _errorState.errorCount,
    errorsByType: {},
    errorsBySeverity: {},
    recentErrors: _errorState.errorHistory.slice(-10)
  };
  
  _errorState.errorHistory.forEach(error => {
    stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + 1;
    stats.errorsBySeverity[error.severity] = (stats.errorsBySeverity[error.severity] || 0) + 1;
  });
  
  return stats;
}

// Clear error history
function clearErrorHistory() {
  _errorState.errorHistory = [];
  _errorState.errorCount = 0;
  _errorState.lastErrorTime = null;
  _errorState.currentError = null;
}

// Export error manager
window.ErrorManager = {
  handleError,
  retryLastAction,
  showErrorDetails,
  copyErrorDetails,
  getErrorStats,
  clearErrorHistory,
  ErrorTypes,
  ErrorSeverity
};
