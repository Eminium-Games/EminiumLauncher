/**
 * UI Helper Functions for Eminium Launcher
 * Contains all UI-related helper functions and utilities
 */

// Create animated background particles (optimized for performance)
function createParticles() {
  const particlesContainer = document.querySelector('.bg-particles');
  if (!particlesContainer) return;
  
  // Clear existing particles
  particlesContainer.innerHTML = '';
  
  // Reduce particle count for better performance
  const particleCount = Math.min(30, Math.floor(window.innerWidth / 50));
  
  // Use requestAnimationFrame for smoother animation
  requestAnimationFrame(() => {
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 20 + 's';
      particle.style.animationDuration = (15 + Math.random() * 10) + 's';
      
      // Add will-change for better performance
      particle.style.willChange = 'transform, opacity';
      
      fragment.appendChild(particle);
    }
    
    particlesContainer.appendChild(fragment);
  });
}

// Lazy loading for images (optimized performance)
function initLazyLoading() {
  const images = document.querySelectorAll('img[data-src]');
  if (!images.length) return;
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
        
        // Add fade-in effect
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          img.style.opacity = '1';
        }, 50);
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.1
  });
  
  images.forEach(img => imageObserver.observe(img));
}

// Tab switching functionality (optimized with event delegation)
function initTabSwitching() {
  const navContainer = document.querySelector('.nav-container');
  if (!navContainer) return;
  
  // Use event delegation for better performance
  navContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.nav-item');
    if (!tab) return;
    
    // Remove active class from all tabs and content sections
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    // Add active class to clicked tab
    tab.classList.add('active');
    
    // Show corresponding content section
    const tabId = tab.getAttribute('data-tab');
    const contentSection = document.getElementById(tabId);
    if (contentSection) {
      contentSection.classList.add('active');
    }
  });
}

// Set tabs visibility based on authentication state
function setTabsForAuth(logged, isAdmin = false) {
  const tabs = document.querySelectorAll('.nav-item');
  tabs.forEach(tab => {
    const tabId = tab.getAttribute('data-tab');
    if (tabId === 'auth') {
      tab.style.display = logged ? 'none' : 'flex';
    } else if (tabId === 'admin') {
      tab.style.display = (logged && isAdmin) ? 'flex' : 'none';
    } else {
      tab.style.display = logged ? 'flex' : 'none';
    }
  });
}

// Admin helpers
function isAdminClient(profile) {
  if (!profile || !profile.grade) return false;
  const grade = formatGrade(profile.grade);
  return ['admin', 'administrateur', 'modérateur', 'helper'].some(
    role => grade.toLowerCase().includes(role)
  );
}

function hasPrivilegedAccess(profile) {
  return isAdminClient(profile);
}

// Ensure we can toggle Play content with a replacement image
function ensurePlayReplacement() {
  const playSection = window.DOMUtils?.getElement('play', false);
  if (!playSection) return;
  
  const existingReplacement = playSection.querySelector('.play-replacement');
  if (existingReplacement) return;
  
  const replacement = window.DOMUtils?.createElement('div', { className: 'play-replacement' });
  replacement.innerHTML = `
    <div style="text-align: center; padding: 60px 20px;">
      <img src="https://via.placeholder.com/400x200?text=Connectez-vous+pour+jouer" 
           alt="Connectez-vous pour jouer" 
           style="max-width: 100%; height: auto; border-radius: 12px; opacity: 0.7;">
      <p style="margin-top: 20px; color: var(--text-secondary); font-size: 16px;">
        Veuillez vous connecter pour accéder aux options de jeu
      </p>
    </div>
  `;
  replacement.style.display = 'none';
  playSection.appendChild(replacement);
}

function setPlayRestricted(restricted) {
  const playSection = window.DOMUtils?.getElement('play', false);
  if (!playSection) return;
  
  const replacement = playSection.querySelector('.play-replacement');
  const actualContent = playSection.querySelector('.panel');
  
  if (restricted) {
    if (replacement) replacement.style.display = 'block';
    if (actualContent) actualContent.style.display = 'none';
  } else {
    if (replacement) replacement.style.display = 'none';
    if (actualContent) actualContent.style.display = 'block';
  }
}

// Helper: hide/show Connexion tab
function setAuthTabHidden(hidden) {
  const authTab = document.querySelector('.nav-item[data-tab="auth"]');
  if (authTab) {
    authTab.style.display = hidden ? 'none' : 'flex';
  }
}

// Toggle functionality
function initToggleButtons() {
  document.querySelectorAll('.toggle').forEach(toggle => {
    if (!toggle) return;
    
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      
      // Handle specific toggle behaviors
      if (toggle.id === 'fpsUnlimited') {
        const isUnlimited = toggle.classList.contains('active');
        
        if (window.DOMUtils) {
          window.DOMUtils.setDisabled('fps', isUnlimited);
          const fpsValue = window.DOMUtils.getValue('fps', '120');
          window.DOMUtils.setText('fpsLabel', isUnlimited ? 'Illimité' : fpsValue);
          
          if (isUnlimited) {
            window.DOMUtils.addClass('fps', 'dim');
            const fpsSlider = window.DOMUtils.getElement('fps', false);
            if (fpsSlider) {
              fpsSlider.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.10))';
            }
          } else {
            window.DOMUtils.removeClass('fps', 'dim');
          }
        }
      }
    });
  });
}

// Grade color helpers
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgba(hex, a) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})` : hex;
}

function paletteColorForGrade(name) {
  const colors = {
    'admin': '#ef4444',
    'administrateur': '#ef4444',
    'modérateur': '#f59e0b',
    'helper': '#10b981',
    'vip': '#8b5cf6',
    'membre': '#6b7280',
    'default': '#6b7280'
  };
  
  const normalizedName = name.toLowerCase().trim();
  return colors[normalizedName] || colors.default;
}

function applyGradeStyle(el, hex, name) {
  if (!el) return;
  el.style.background = hex;
  el.style.color = '#ffffff';
  el.style.boxShadow = `0 4px 12px ${rgba(hex, 0.3)}`;
}

// Toggle skeleton state for profile UI
function setProfileSkeleton(on) {
  const profileCard = document.querySelector('.profile-card');
  if (!profileCard) return;
  
  const profileName = profileCard.querySelector('.profile-name');
  const profileGrade = profileCard.querySelector('.profile-grade');
  
  if (on) {
    if (profileName) profileName.textContent = 'Chargement...';
    if (profileGrade) profileGrade.style.display = 'none';
    profileCard.style.opacity = '0.6';
  } else {
    profileCard.style.opacity = '1';
  }
}

// Format grade text from possible shapes (string | object | array)
function formatGrade(v) {
  if (!v) return 'Membre';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.name) return v.name;
  if (Array.isArray(v) && v.length > 0) return formatGrade(v[0]);
  return 'Membre';
}

// Switch to Play tab
function switchToPlayTab() {
  const playTab = document.querySelector('.nav-item[data-tab="play"]');
  if (playTab) {
    playTab.click();
  }
}

// Enhanced animation management for smooth UX
function initEnhancedAnimations() {
  // Smooth scroll behavior
  document.documentElement.style.scrollBehavior = 'smooth';
  
  // Add ripple effect to buttons
  document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        left: ${x}px;
        top: ${y}px;
        pointer-events: none;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
      `;
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
  
  // Add hover effect to interactive elements
  document.querySelectorAll('.nav-item, .profile-card, .panel, .toggle').forEach(element => {
    element.addEventListener('mouseenter', function() {
      this.style.transform = this.style.transform + ' scale(1.02)';
    });
    
    element.addEventListener('mouseleave', function() {
      this.style.transform = this.style.transform.replace(' scale(1.02)', '');
    });
  });
  
  // Add smooth focus transitions to form inputs
  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('focus', function() {
      this.parentElement.style.transform = 'translateY(-2px)';
    });
    
    input.addEventListener('blur', function() {
      this.parentElement.style.transform = 'translateY(0)';
    });
  });
}

// Add ripple animation to CSS
function addRippleAnimation() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize all UI helpers
function initUIHelpers() {
  createParticles();
  initTabSwitching();
  initLazyLoading();
  initEnhancedAnimations();
  addRippleAnimation();
  
  // Optimize resize handling
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      createParticles();
    }, 250); // Debounced resize handling
  });
}

initToggleButtons();

// Export functions for use in other modules
window.UIHelpers = {
  createParticles,
  initTabSwitching,
  initLazyLoading,
  initEnhancedAnimations,
  addRippleAnimation,
  setTabsForAuth,
  isAdminClient,
  hasPrivilegedAccess,
  ensurePlayReplacement,
  setPlayRestricted,
  setAuthTabHidden,
  initToggleButtons,
  hexToRgb,
  rgba,
  paletteColorForGrade,
  applyGradeStyle,
  setProfileSkeleton,
  formatGrade,
  switchToPlayTab,
  initUIHelpers
};
