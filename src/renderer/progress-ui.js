/**
 * Progress UI Manager for Eminium Launcher
 * Handles all progress-related UI functionality
 */

// Progress UI state
let _progressState = {
  open: false,
  title: '',
  percent: 0,
  lines: [],
  phases: [],
  startTime: null,
  bytesDownloaded: 0,
  lastBytesTime: null
};

// Progress UI DOM elements
let _progressElements = {
  modal: null,
  title: null,
  percent: null,
  bar: null,
  log: null,
  close: null
};

// Initialize progress UI elements
function initProgressElements() {
  _progressElements.modal = document.getElementById('progressModal');
  _progressElements.title = document.querySelector('.progress-title');
  _progressElements.percent = document.querySelector('.progress-percent');
  _progressElements.bar = document.querySelector('.progress-bar-fill');
  _progressElements.log = document.querySelector('.progress-log');
  _progressElements.close = document.querySelector('.progress-close');
}

// Open progress modal
function open(title = 'Progression') {
  if (!_progressElements.modal) initProgressElements();
  
  _progressState.open = true;
  _progressState.title = title;
  _progressState.percent = 0;
  _progressState.lines = [];
  _progressState.phases = [];
  _progressState.startTime = Date.now();
  _progressState.bytesDownloaded = 0;
  _progressState.lastBytesTime = null;
  
  if (_progressElements.modal) {
    _progressElements.modal.style.display = 'flex';
  }
  if (_progressElements.title) {
    _progressElements.title.textContent = title;
  }
  if (_progressElements.log) {
    _progressElements.log.innerHTML = '';
  }
  if (_progressElements.close) {
    _progressElements.close.style.display = 'none';
  }
  
  updateProgressDisplay();
}

// Close progress modal
function close() {
  _progressState.open = false;
  if (_progressElements.modal) {
    _progressElements.modal.style.display = 'none';
  }
}

// Set progress percentage
function set(percent) {
  _progressState.percent = Math.max(0, Math.min(100, percent));
  updateProgressDisplay();
}

// Add a line to the progress log
function addLine(line, cls = '') {
  const timestamp = new Date().toLocaleTimeString();
  const lineEntry = {
    text: line,
    class: cls,
    timestamp: timestamp
  };
  
  _progressState.lines.push(lineEntry);
  
  if (_progressElements.log) {
    const div = document.createElement('div');
    div.className = `log-entry ${cls}`;
    div.innerHTML = `<span class="log-time">[${timestamp}]</span> ${line}`;
    _progressElements.log.appendChild(div);
    _progressElements.log.scrollTop = _progressElements.log.scrollHeight;
  }
}

// Enable close button
function enableClose() {
  if (_progressElements.close) {
    _progressElements.close.style.display = 'block';
  }
}

// Check if progress modal is open
function isOpen() {
  return _progressState.open;
}

// Reset progress phases
function resetPhases() {
  _progressState.phases = [];
  updateProgressDisplay();
}

// Update progress phases
function updatePhases(percent) {
  if (!_progressState.phases.includes(percent)) {
    _progressState.phases.push(percent);
    _progressState.phases.sort((a, b) => a - b);
  }
  updateProgressDisplay();
}

// Calculate download speed
function calculateSpeed(bytesDownloaded) {
  const now = Date.now();
  if (!_progressState.lastBytesTime) {
    _progressState.lastBytesTime = now;
    _progressState.bytesDownloaded = bytesDownloaded;
    return 0;
  }
  
  const timeDiff = (now - _progressState.lastBytesTime) / 1000; // seconds
  const bytesDiff = bytesDownloaded - _progressState.bytesDownloaded;
  
  _progressState.lastBytesTime = now;
  _progressState.bytesDownloaded = bytesDownloaded;
  
  if (timeDiff > 0) {
    return Math.round(bytesDiff / timeDiff); // bytes per second
  }
  return 0;
}

// Calculate ETA
function calculateETA(percent, totalBytes) {
  if (percent <= 0 || percent >= 100) return null;
  
  const elapsed = Date.now() - _progressState.startTime;
  const total = (elapsed * 100) / percent;
  const remaining = total - elapsed;
  
  if (remaining > 0) {
    return Math.round(remaining / 1000); // seconds
  }
  return null;
}

// Update progress display
function updateProgressDisplay() {
  if (!_progressElements.modal) return;
  
  // Update percentage
  if (_progressElements.percent) {
    _progressElements.percent.textContent = `${Math.round(_progressState.percent)}%`;
  }
  
  // Update progress bar
  if (_progressElements.bar) {
    _progressElements.bar.style.width = `${_progressState.percent}%`;
  }
  
  // Update phases
  const phasesContainer = document.querySelector('.progress-phases');
  if (phasesContainer) {
    phasesContainer.innerHTML = '';
    _progressState.phases.forEach(phase => {
      const phaseEl = document.createElement('div');
      phaseEl.className = 'progress-phase';
      phaseEl.style.left = `${phase}%`;
      phasesContainer.appendChild(phaseEl);
    });
  }
}

// Progress UI logger functions
const progressLogger = {
  // Log with different severity levels
  info: function(message) {
    addLine(message, 'info');
  },
  
  success: function(message) {
    addLine(message, 'success');
  },
  
  warning: function(message) {
    addLine(message, 'warning');
  },
  
  error: function(message) {
    addLine(message, 'error');
  },
  
  debug: function(message) {
    addLine(message, 'debug');
  },
  
  highlight: function(message) {
    addLine(message, 'highlight');
  },
  
  // Log file operations
  fileStart: function(filename) {
    addLine(`Téléchargement de ${filename}...`, 'file-start');
  },
  
  fileComplete: function(filename, size = null) {
    const sizeText = size ? ` (${formatBytes(size)})` : '';
    addLine(`${filename} terminé${sizeText}`, 'file-complete');
  },
  
  fileError: function(filename, error) {
    addLine(`Erreur pour ${filename}: ${error}`, 'file-error');
  },
  
  // Log download progress
  downloadStart: function(url, filename) {
    addLine(`Début du téléchargement: ${filename}`, 'download-start');
  },
  
  downloadProgress: function(filename, percent, speed) {
    const speedText = speed ? ` - ${formatBytes(speed)}/s` : '';
    addLine(`${filename}: ${Math.round(percent)}%${speedText}`, 'download-progress');
  },
  
  downloadComplete: function(filename, totalSize) {
    addLine(`Téléchargement terminé: ${filename} (${formatBytes(totalSize)})`, 'download-complete');
  },
  
  // Log installation steps
  installStart: function(component) {
    addLine(`Installation de ${component}...`, 'install-start');
  },
  
  installProgress: function(component, step, total) {
    addLine(`${component}: ${step}/${total}`, 'install-progress');
  },
  
  installComplete: function(component) {
    addLine(`Installation terminée: ${component}`, 'install-complete');
  },
  
  // Log verification steps
  verifyStart: function(target) {
    addLine(`Vérification de ${target}...`, 'verify-start');
  },
  
  verifyProgress: function(current, total) {
    addLine(`Vérification: ${current}/${total}`, 'verify-progress');
  },
  
  verifyComplete: function(target) {
    addLine(`Vérification terminée: ${target}`, 'verify-complete');
  },
  
  // Log system operations
  systemInfo: function(info) {
    addLine(`Système: ${info}`, 'system-info');
  },
  
  systemWarning: function(warning) {
    addLine(`Attention système: ${warning}`, 'system-warning');
  },
  
  // Log milestones
  milestone: function(message) {
    addLine(`🎯 ${message}`, 'milestone');
  },
  
  // Log completion
  complete: function(message) {
    addLine(`✅ ${message}`, 'complete');
  },
  
  // Log errors with details
  errorDetails: function(error, context = '') {
    const contextText = context ? ` (${context})` : '';
    addLine(`❌ Erreur${contextText}: ${error}`, 'error-details');
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

// Initialize progress UI event listeners
function initProgressListeners() {
  if (_progressElements.close) {
    _progressElements.close.addEventListener('click', close);
  }
}

// Initialize progress UI
function initProgressUI() {
  initProgressElements();
  initProgressListeners();
}

// Export functions and logger for use in other modules
window.ProgressUI = {
  open,
  close,
  set,
  addLine,
  enableClose,
  isOpen,
  resetPhases,
  updatePhases,
  calculateSpeed,
  calculateETA,
  formatBytes,
  initProgressUI,
  logger: progressLogger
};
