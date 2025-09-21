/**
 * Common Utilities for Eminium Launcher
 * Provides shared utility functions to reduce code duplication
 */

// Debounce function for performance optimization
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function for performance optimization
function throttle(func, limit = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Format file size to human readable format
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format percentage with decimal places
function formatPercentage(value, decimals = 1) {
  return `${value.toFixed(decimals)}%`;
}

// Format duration in seconds to human readable format
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

// Safe JSON parse with error handling
function safeJSONParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return defaultValue;
  }
}

// Safe JSON stringify with error handling
function safeJSONStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn('Failed to stringify JSON:', error);
    return defaultValue;
  }
}

// Generate unique ID
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Check if value is empty (null, undefined, empty string, empty array, empty object)
function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// Deep clone object
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
}

// Merge objects deeply
function deepMerge(target, source) {
  const result = deepClone(target);
  
  if (typeof source !== 'object' || source === null) return result;
  
  Object.keys(source).forEach(key => {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (typeof sourceValue === 'object' && sourceValue !== null &&
        typeof targetValue === 'object' && targetValue !== null) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = deepClone(sourceValue);
    }
  });
  
  return result;
}

// Retry function with exponential backoff
async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError;
}

// Create a simple event emitter
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }
  
  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(data));
  }
  
  once(event, callback) {
    const onceWrapper = (data) => {
      callback(data);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }
}

// Create a simple state manager
class StateManager {
  constructor(initialState = {}) {
    this.state = deepClone(initialState);
    this.listeners = [];
    this.emitter = new EventEmitter();
  }
  
  getState() {
    return deepClone(this.state);
  }
  
  setState(partialState) {
    const oldState = this.state;
    this.state = deepMerge(this.state, partialState);
    
    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.state, oldState);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
    
    // Emit change event
    this.emitter.emit('change', { state: this.state, oldState });
  }
  
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  on(event, callback) {
    return this.emitter.on(event, callback);
  }
  
  off(event, callback) {
    return this.emitter.off(event, callback);
  }
}

// Performance monitoring
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }
  
  start(label) {
    this.metrics.set(label, {
      start: performance.now(),
      end: null,
      duration: null
    });
  }
  
  end(label) {
    const metric = this.metrics.get(label);
    if (metric && !metric.end) {
      metric.end = performance.now();
      metric.duration = metric.end - metric.start;
      console.log(`[Performance] ${label}: ${metric.duration.toFixed(2)}ms`);
      return metric.duration;
    }
    return null;
  }
  
  getMetrics() {
    const result = {};
    this.metrics.forEach((metric, label) => {
      result[label] = metric;
    });
    return result;
  }
  
  clear() {
    this.metrics.clear();
  }
}

// Export common utilities
window.CommonUtils = {
  debounce,
  throttle,
  formatFileSize,
  formatPercentage,
  formatDuration,
  safeJSONParse,
  safeJSONStringify,
  generateUniqueId,
  isEmpty,
  deepClone,
  deepMerge,
  retry,
  EventEmitter,
  StateManager,
  PerformanceMonitor
};
