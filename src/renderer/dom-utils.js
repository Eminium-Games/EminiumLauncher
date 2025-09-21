/**
 * DOM Utilities for Eminium Launcher
 * Provides common DOM operations to reduce code duplication
 */

// Cache for DOM elements to avoid repeated queries
const _domCache = new Map();

// Get DOM element with caching
function getElement(id, useCache = true) {
  if (useCache && _domCache.has(id)) {
    return _domCache.get(id);
  }
  
  const element = document.getElementById(id);
  if (useCache && element) {
    _domCache.set(id, element);
  }
  
  return element;
}

// Get multiple DOM elements by IDs
function getElements(ids, useCache = true) {
  const elements = {};
  ids.forEach(id => {
    elements[id] = getElement(id, useCache);
  });
  return elements;
}

// Clear DOM cache (useful when DOM changes)
function clearDOMCache() {
  _domCache.clear();
}

// Safe add event listener with null check
function addEventListener(elementId, eventType, handler, options = {}) {
  const element = getElement(elementId);
  if (element) {
    element.addEventListener(eventType, handler, options);
    return true;
  }
  return false;
}

// Safe add event listener to multiple elements
function addEventListeners(elementIds, eventType, handler, options = {}) {
  let successCount = 0;
  elementIds.forEach(id => {
    if (addEventListener(id, eventType, handler, options)) {
      successCount++;
    }
  });
  return successCount;
}

// Remove event listener safely
function removeEventListener(elementId, eventType, handler) {
  const element = getElement(elementId);
  if (element) {
    element.removeEventListener(eventType, handler);
    return true;
  }
  return false;
}

// Set element text content safely
function setText(elementId, text) {
  const element = getElement(elementId);
  if (element) {
    element.textContent = text;
    return true;
  }
  return false;
}

// Get element value safely
function getValue(elementId, defaultValue = '') {
  const element = getElement(elementId);
  if (element) {
    return element.value || defaultValue;
  }
  return defaultValue;
}

// Set element value safely
function setValue(elementId, value) {
  const element = getElement(elementId);
  if (element) {
    element.value = value;
    return true;
  }
  return false;
}

// Toggle class on element
function toggleClass(elementId, className, force) {
  const element = getElement(elementId);
  if (element) {
    element.classList.toggle(className, force);
    return true;
  }
  return false;
}

// Add class to element
function addClass(elementId, className) {
  const element = getElement(elementId);
  if (element) {
    element.classList.add(className);
    return true;
  }
  return false;
}

// Remove class from element
function removeClass(elementId, className) {
  const element = getElement(elementId);
  if (element) {
    element.classList.remove(className);
    return true;
  }
  return false;
}

// Check if element has class
function hasClass(elementId, className) {
  const element = getElement(elementId);
  if (element) {
    return element.classList.contains(className);
  }
  return false;
}

// Set element display style
function setDisplay(elementId, display) {
  const element = getElement(elementId);
  if (element) {
    element.style.display = display;
    return true;
  }
  return false;
}

// Show element
function show(elementId, display = 'block') {
  return setDisplay(elementId, display);
}

// Hide element
function hide(elementId) {
  return setDisplay(elementId, 'none');
}

// Toggle element visibility
function toggle(elementId, display = 'block') {
  const element = getElement(elementId);
  if (element) {
    if (element.style.display === 'none') {
      return show(elementId, display);
    } else {
      return hide(elementId);
    }
  }
  return false;
}

// Set element disabled state
function setDisabled(elementId, disabled) {
  const element = getElement(elementId);
  if (element) {
    element.disabled = disabled;
    return true;
  }
  return false;
}

// Check if element is disabled
function isDisabled(elementId) {
  const element = getElement(elementId);
  if (element) {
    return element.disabled;
  }
  return false;
}

// Set element attribute
function setAttribute(elementId, attribute, value) {
  const element = getElement(elementId);
  if (element) {
    element.setAttribute(attribute, value);
    return true;
  }
  return false;
}

// Get element attribute
function getAttribute(elementId, attribute, defaultValue = null) {
  const element = getElement(elementId);
  if (element) {
    return element.getAttribute(attribute) || defaultValue;
  }
  return defaultValue;
}

// Remove element attribute
function removeAttribute(elementId, attribute) {
  const element = getElement(elementId);
  if (element) {
    element.removeAttribute(attribute);
    return true;
  }
  return false;
}

// Create element with attributes and children
function createElement(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  
  // Add children
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof HTMLElement) {
      element.appendChild(child);
    }
  });
  
  return element;
}

// Remove element from DOM
function removeElement(elementId) {
  const element = getElement(elementId, false); // Don't use cache for removal
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
    _domCache.delete(elementId); // Remove from cache
    return true;
  }
  return false;
}

// Query selector with caching
function querySelector(selector, useCache = true) {
  if (useCache && _domCache.has(selector)) {
    return _domCache.get(selector);
  }
  
  const element = document.querySelector(selector);
  if (useCache && element) {
    _domCache.set(selector, element);
  }
  
  return element;
}

// Query selector all with caching
function querySelectorAll(selector, useCache = true) {
  if (useCache && _domCache.has(selector)) {
    return _domCache.get(selector);
  }
  
  const elements = document.querySelectorAll(selector);
  if (useCache) {
    _domCache.set(selector, elements);
  }
  
  return elements;
}

// Batch DOM operations for better performance
function batchDOMOperations(operations) {
  // Use requestAnimationFrame for better performance
  requestAnimationFrame(() => {
    operations.forEach(operation => {
      try {
        operation();
      } catch (error) {
        console.error('Error in batch DOM operation:', error);
      }
    });
  });
}

// Debounce function for DOM operations
function debounceDOM(func, wait = 100) {
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

// Throttle function for DOM operations
function throttleDOM(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Check if element exists in DOM
function elementExists(elementId) {
  return getElement(elementId, false) !== null;
}

// Wait for element to exist in DOM
function waitForElement(elementId, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (elementExists(elementId)) {
      resolve(getElement(elementId));
      return;
    }
    
    const observer = new MutationObserver((mutations, obs) => {
      if (elementExists(elementId)) {
        obs.disconnect();
        resolve(getElement(elementId));
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${elementId} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Export DOM utilities
window.DOMUtils = {
  getElement,
  getElements,
  clearDOMCache,
  addEventListener,
  addEventListeners,
  removeEventListener,
  setText,
  getValue,
  setValue,
  toggleClass,
  addClass,
  removeClass,
  hasClass,
  setDisplay,
  show,
  hide,
  toggle,
  setDisabled,
  isDisabled,
  setAttribute,
  getAttribute,
  removeAttribute,
  createElement,
  removeElement,
  querySelector,
  querySelectorAll,
  batchDOMOperations,
  debounceDOM,
  throttleDOM,
  elementExists,
  waitForElement
};
