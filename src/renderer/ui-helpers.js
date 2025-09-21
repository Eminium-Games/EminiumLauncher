/**
 * UI Helper Functions for Eminium Launcher
 * Contains all UI-related helper functions and utilities
 */

// Create animated background particles
function createParticles() {
  const particlesContainer = document.querySelector('.bg-particles');
  if (!particlesContainer) return;
  
  particlesContainer.innerHTML = '';
  const particleCount = 50;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.animationDuration = (15 + Math.random() * 10) + 's';
    particlesContainer.appendChild(particle);
  }
}

// Tab switching functionality
function initTabSwitching() {
  document.querySelectorAll('.nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
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
  const playSection = document.getElementById('play');
  if (!playSection) return;
  
  const existingReplacement = playSection.querySelector('.play-replacement');
  if (existingReplacement) return;
  
  const replacement = document.createElement('div');
  replacement.className = 'play-replacement';
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
  const playSection = document.getElementById('play');
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
        const fpsSlider = document.getElementById('fps');
        const fpsLabel = document.getElementById('fpsLabel');
        if (fpsSlider && fpsLabel) {
          const isUnlimited = toggle.classList.contains('active');
          fpsSlider.disabled = isUnlimited;
          fpsLabel.textContent = isUnlimited ? 'Illimité' : fpsSlider.value;
          
          if (isUnlimited) {
            fpsSlider.classList.add('dim');
            fpsSlider.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.10))';
          } else {
            fpsSlider.classList.remove('dim');
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

// Initialize all UI helpers
function initUIHelpers() {
  createParticles();
  initTabSwitching();
  initToggleButtons();
  ensurePlayReplacement();
}

// Export functions for use in other modules
window.UIHelpers = {
  createParticles,
  initTabSwitching,
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
