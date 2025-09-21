/**
 * Logger for Eminium Launcher
 * Provides centralized logging functionality with different severity levels
 */

// Log levels
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  HIGHLIGHT: 'highlight'
};

// Logger configuration
const LOGGER_CONFIG = {
  maxLogEntries: 100,
  enableConsole: true,
  enableUI: true,
  timestampFormat: 'HH:mm:ss'
};

// Log storage
let _logEntries = [];
let _logCallbacks = [];

// Format timestamp
function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Create log entry
function createLogEntry(message, level = LOG_LEVELS.INFO) {
  return {
    timestamp: formatTimestamp(),
    message: message,
    level: level,
    id: Date.now() + Math.random()
  };
}

// Add log entry to storage
function addLogEntry(entry) {
  _logEntries.push(entry);
  
  // Limit log entries
  if (_logEntries.length > LOGGER_CONFIG.maxLogEntries) {
    _logEntries.shift();
  }
  
  // Notify callbacks
  _logCallbacks.forEach(callback => {
    try {
      callback(entry);
    } catch (error) {
      console.warn('Error in log callback:', error);
    }
  });
}

// Log to console
function logToConsole(entry) {
  if (!LOGGER_CONFIG.enableConsole) return;
  
  const prefix = `[${entry.timestamp}]`;
  const message = `${prefix} ${entry.message}`;
  
  switch (entry.level) {
    case LOG_LEVELS.DEBUG:
      console.debug(message);
      break;
    case LOG_LEVELS.INFO:
      console.info(message);
      break;
    case LOG_LEVELS.SUCCESS:
      console.log(`%c${message}`, 'color: #10b981; font-weight: bold;');
      break;
    case LOG_LEVELS.WARNING:
      console.warn(message);
      break;
    case LOG_LEVELS.ERROR:
      console.error(message);
      break;
    case LOG_LEVELS.HIGHLIGHT:
      console.log(`%c${message}`, 'color: #fbbf24; font-weight: bold;');
      break;
    default:
      console.log(message);
  }
}

// Log to UI
function logToUI(entry) {
  if (!LOGGER_CONFIG.enableUI) return;
  
  // Also log to progress UI if available
  if (window.ProgressUI && window.ProgressUI.logger) {
    switch (entry.level) {
      case LOG_LEVELS.DEBUG:
        window.ProgressUI.logger.debug(entry.message);
        break;
      case LOG_LEVELS.INFO:
        window.ProgressUI.logger.info(entry.message);
        break;
      case LOG_LEVELS.SUCCESS:
        window.ProgressUI.logger.success(entry.message);
        break;
      case LOG_LEVELS.WARNING:
        window.ProgressUI.logger.warning(entry.message);
        break;
      case LOG_LEVELS.ERROR:
        window.ProgressUI.logger.error(entry.message);
        break;
      case LOG_LEVELS.HIGHLIGHT:
        window.ProgressUI.logger.highlight(entry.message);
        break;
    }
  }
}

// Core logging function
function log(message, level = LOG_LEVELS.INFO) {
  const entry = createLogEntry(message, level);
  addLogEntry(entry);
  logToConsole(entry);
  logToUI(entry);
}

// Logger API
const Logger = {
  // Basic logging
  debug: function(message) {
    log(message, LOG_LEVELS.DEBUG);
  },
  
  info: function(message) {
    log(message, LOG_LEVELS.INFO);
  },
  
  success: function(message) {
    log(message, LOG_LEVELS.SUCCESS);
  },
  
  warning: function(message) {
    log(message, LOG_LEVELS.WARNING);
  },
  
  error: function(message) {
    log(message, LOG_LEVELS.ERROR);
  },
  
  highlight: function(message) {
    log(message, LOG_LEVELS.HIGHLIGHT);
  },
  
  // Specialized logging for different operations
  fileStart: function(filename) {
    log(`Téléchargement de ${filename}...`, LOG_LEVELS.INFO);
  },
  
  fileComplete: function(filename, size = null) {
    const sizeText = size ? ` (${formatBytes(size)})` : '';
    log(`${filename} terminé${sizeText}`, LOG_LEVELS.SUCCESS);
  },
  
  fileError: function(filename, error) {
    log(`Erreur pour ${filename}: ${error}`, LOG_LEVELS.ERROR);
  },
  
  downloadStart: function(url, filename) {
    log(`Début du téléchargement: ${filename}`, LOG_LEVELS.INFO);
  },
  
  downloadProgress: function(filename, percent, speed) {
    const speedText = speed ? ` - ${formatBytes(speed)}/s` : '';
    log(`${filename}: ${Math.round(percent)}%${speedText}`, LOG_LEVELS.INFO);
  },
  
  downloadComplete: function(filename, totalSize) {
    log(`Téléchargement terminé: ${filename} (${formatBytes(totalSize)})`, LOG_LEVELS.SUCCESS);
  },
  
  installStart: function(component) {
    log(`Installation de ${component}...`, LOG_LEVELS.INFO);
  },
  
  installProgress: function(component, step, total) {
    log(`${component}: ${step}/${total}`, LOG_LEVELS.INFO);
  },
  
  installComplete: function(component) {
    log(`Installation terminée: ${component}`, LOG_LEVELS.SUCCESS);
  },
  
  verifyStart: function(target) {
    log(`Vérification de ${target}...`, LOG_LEVELS.INFO);
  },
  
  verifyProgress: function(current, total) {
    log(`Vérification: ${current}/${total}`, LOG_LEVELS.INFO);
  },
  
  verifyComplete: function(target) {
    log(`Vérification terminée: ${target}`, LOG_LEVELS.SUCCESS);
  },
  
  systemInfo: function(info) {
    log(`Système: ${info}`, LOG_LEVELS.INFO);
  },
  
  systemWarning: function(warning) {
    log(`Attention système: ${warning}`, LOG_LEVELS.WARNING);
  },
  
  milestone: function(message) {
    log(`🎯 ${message}`, LOG_LEVELS.HIGHLIGHT);
  },
  
  complete: function(message) {
    log(`✅ ${message}`, LOG_LEVELS.SUCCESS);
  },
  
  errorDetails: function(error, context = '') {
    const contextText = context ? ` (${context})` : '';
    log(`❌ Erreur${contextText}: ${error}`, LOG_LEVELS.ERROR);
  },
  
  // Utility functions
  getLogEntries: function() {
    return [..._logEntries];
  },
  
  clearLogs: function() {
    _logEntries = [];
  },
  
  addLogCallback: function(callback) {
    _logCallbacks.push(callback);
    return () => {
      const index = _logCallbacks.indexOf(callback);
      if (index > -1) {
        _logCallbacks.splice(index, 1);
      }
    };
  },
  
  setConfig: function(config) {
    Object.assign(LOGGER_CONFIG, config);
  }
};

// Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Legacy log function for backward compatibility
function legacyLog(msg) {
  Logger.info(msg);
}

// Initialize logger
function initLogger() {
  // Set up global log function for backward compatibility
  window.log = legacyLog;
  
  Logger.info('Logger initialized');
}

// Export logger for use in other modules
window.Logger = Logger;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogger);
} else {
  initLogger();
}
