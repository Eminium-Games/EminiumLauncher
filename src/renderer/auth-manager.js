/**
 * Authentication Manager for Eminium Launcher
 * Handles all authentication-related functionality
 */

// API URL configuration
const SITE_URL = 'https://croissant-api.fr';

// Validation formulaire login
function validateLogin(email, pass, code2fa) {
  if (!email || !pass) {
    return { valid: false, error: 'Email et mot de passe requis' };
  }
  if (!email.includes('@')) {
    return { valid: false, error: 'Email invalide' };
  }
  if (pass.length < 6) {
    return { valid: false, error: 'Mot de passe trop court' };
  }
  return { valid: true };
}

// Set authentication error message
function setAuthError(msg) {
  if (window.DOMUtils) {
    window.DOMUtils.setText('authError', msg || '');
    window.DOMUtils.setDisplay('authError', msg ? 'block' : 'none');
  }
}

// Map login error to user-friendly message
function mapLoginError(result, caught) {
  if (caught) {
    return 'Erreur réseau: ' + (caught.message || 'inconnue');
  }
  if (!result) {
    return 'Réponse invalide du serveur';
  }
  if (result.error) {
    if (result.error.includes('401') || result.error.includes('unauthorized')) {
      return 'Email ou mot de passe incorrect';
    }
    if (result.error.includes('2fa') || result.error.includes('code')) {
      return 'Code 2FA incorrect';
    }
    return result.error;
  }
  if (!result.ok) {
    return 'Échec de la connexion';
  }
  return null;
}

// Test connection to server before attempting login
async function testConnection() {
  try {
    const response = await fetch(`${SITE_URL}/api/ping`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'EminiumLauncher/1.0'
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (response.ok) {
      return { ok: true, message: 'Connexion au serveur OK' };
    } else {
      return { ok: false, message: `Serveur répond avec le code ${response.status}` };
    }
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return { ok: false, message: 'Timeout de connexion (serveur injoignable)' };
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return { ok: false, message: 'Impossible de contacter le serveur' };
    } else {
      return { ok: false, message: error.message || 'Erreur de connexion inconnue' };
    }
  }
}

// Update UI after successful login
function updateUIAfterLogin(profile) {
  if (!profile) return;
  
  // Update profile display
  const profileName = document.querySelector('.profile-name');
  const profileUuid = document.querySelector('.profile-uuid');
  const profileGrade = document.querySelector('.profile-grade');
  const profileAvatar = document.querySelector('.profile-avatar img');
  
  if (profileName) profileName.textContent = profile.username || profile.pseudo || 'Utilisateur';
  if (profileUuid) profileUuid.textContent = profile.uuid || profile.id || '';
  if (profileGrade) {
    const gradeText = window.UIHelpers.formatGrade(profile.grade);
    profileGrade.textContent = gradeText;
    const gradeColor = window.UIHelpers.paletteColorForGrade(gradeText);
    window.UIHelpers.applyGradeStyle(profileGrade, gradeColor, gradeText);
  }
  if (profileAvatar) {
    profileAvatar.src = profile.avatar || `https://minotar.net/helm/${profile.username || 'steve'}/64`;
  }
  
  // Update tabs
  const isAdmin = window.UIHelpers.isAdminClient(profile);
  window.UIHelpers.setTabsForAuth(true, isAdmin);
  window.UIHelpers.setPlayRestricted(false);
  
  // Switch to play tab
  window.UIHelpers.switchToPlayTab();
}

// Action de connexion unifiée avec protection contre le blocage
async function performLogin(email, pass, code2fa, options = {}) {
  const { quiet = false, onSuccess, onError } = options;

  if (!quiet) {
    setAuthError('');
    window.UIHelpers.setProfileSkeleton(true);
  }

  // Validate input
  const validation = validateLogin(email, pass, code2fa);
  if (!validation.valid) {
    if (!quiet) setAuthError(validation.error);
    if (onError) onError(validation.error);
    return;
  }

  // Add timeout protection for the entire login process
  const loginTimeout = setTimeout(() => {
    if (!quiet) {
      setAuthError('La connexion met trop de temps à répondre. Vérifiez votre connexion internet.');
      window.Logger.error('Connexion timeout après 20 secondes');
      window.UIHelpers.setProfileSkeleton(false);
      showConnectionStatus('Timeout de connexion', 'error');
    }
    if (onError) onError('Timeout de connexion');
  }, 20000);

  try {
    // Test connection first
    if (!quiet) {
      window.Logger.info('Test de connexion au serveur...');
      showConnectionStatus('Test de connexion...', 'info');
    }

    const connectionTest = await testConnection();
    if (!connectionTest.ok) {
      if (!quiet) {
        setAuthError(connectionTest.message);
        window.Logger.error('Test de connexion échoué:', connectionTest.message);
        window.UIHelpers.setProfileSkeleton(false);
        showConnectionStatus('Serveur injoignable', 'error');
      }
      if (onError) onError(connectionTest.message);
      clearTimeout(loginTimeout);
      return;
    }

    if (!quiet) {
      window.Logger.info('Tentative de connexion...');
      showConnectionStatus('Connexion en cours...', 'info');
    }

    const result = await window.eminium.login(email, pass, code2fa);

    clearTimeout(loginTimeout);

    if (result && result.ok) {
      if (!quiet) {
        window.Logger.success('Connexion réussie!');
        updateUIAfterLogin(result.profile);
        window.UIHelpers.setProfileSkeleton(false);
        showConnectionStatus('Connexion réussie!', 'success');
      }

      if (onSuccess) onSuccess(result.profile);
      return result.profile;
    } else {
      const errorMsg = mapLoginError(result);
      if (!quiet) {
        setAuthError(errorMsg);
        window.Logger.error('Échec de connexion: ' + errorMsg);
        window.UIHelpers.setProfileSkeleton(false);
        showConnectionStatus('Échec de connexion', 'error');
      }

      if (onError) onError(errorMsg);
      return null;
    }
  } catch (error) {
    clearTimeout(loginTimeout);
    const errorMsg = mapLoginError(null, error);
    if (!quiet) {
      setAuthError(errorMsg);
      window.Logger.error('Erreur de connexion: ' + errorMsg);
      window.UIHelpers.setProfileSkeleton(false);
      showConnectionStatus('Erreur de connexion', 'error');
    }

    if (onError) onError(errorMsg);
    return null;
  }
}

// Logout function
async function performLogout() {
  try {
    await window.eminium.logout();
    window.Logger.success('Déconnexion réussie');
    
    // Reset UI
    window.UIHelpers.setTabsForAuth(false);
    window.UIHelpers.setPlayRestricted(true);
    window.UIHelpers.setProfileSkeleton(false);
    
    // Clear profile display
    const profileName = document.querySelector('.profile-name');
    const profileUuid = document.querySelector('.profile-uuid');
    const profileGrade = document.querySelector('.profile-grade');
    const profileAvatar = document.querySelector('.profile-avatar img');
    
    if (profileName) profileName.textContent = 'Non connecté';
    if (profileUuid) profileUuid.textContent = '';
    if (profileGrade) profileGrade.textContent = 'Visiteur';
    if (profileAvatar) profileAvatar.src = 'https://minotar.net/helm/steve/64';
    
    // Switch to auth tab
    const authTab = document.querySelector('.nav-item[data-tab="auth"]');
    if (authTab) authTab.click();
    
  } catch (error) {
    window.Logger.error('Erreur lors de la déconnexion: ' + error.message);
  }
}

// Check if user is logged in
async function checkAuthStatus() {
  try {
    const result = await window.eminium.getProfile();
    if (result && result.ok && result.profile) {
      updateUIAfterLogin(result.profile);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Error checking auth status:', error);
    return false;
  }
}

// Initialize authentication event listeners
function initAuthListeners() {
  if (!window.DOMUtils) {
    console.error('DOMUtils not available');
    return;
  }

  let loginInProgress = false;

  // Main login button
  window.DOMUtils.addEventListener('btnLogin', 'click', async () => {
    if (loginInProgress) {
      console.log('[Auth] Login already in progress, ignoring duplicate click');
      return;
    }

    loginInProgress = true;

    const email = window.DOMUtils.getValue('email', '').trim();
    const password = window.DOMUtils.getValue('password', '');
    const code2fa = window.DOMUtils.getValue('code2fa', '').trim();

    // Disable login button during login
    const loginButton = window.DOMUtils.getElement('btnLogin', false);
    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = 'Connexion en cours...';
    }

    try {
      await performLogin(email, password, code2fa);
    } finally {
      loginInProgress = false;
      // Re-enable login button
      if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = 'Se connecter';
      }
    }
  });
  
  // "Se connecter avec Eminium" button
  window.DOMUtils.addEventListener('btnLoginWithEminium', 'click', () => {
    const detailedForm = window.DOMUtils.getElement('detailedLoginForm', false);
    const quickAuth = window.DOMUtils.getElement('quickAuth', false);
    
    if (detailedForm && quickAuth) {
      window.DOMUtils.toggle('detailedLoginForm', 'block');
      window.DOMUtils.toggle('quickAuth', 'block');
    }
  });
  
  // Logout button
  window.DOMUtils.addEventListener('btnLogout', 'click', performLogout);
  
  // Handle Enter key in login form
  window.DOMUtils.addEventListener('loginForm', 'keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const btnLogin = window.DOMUtils.getElement('btnLogin', false);
      if (btnLogin && !btnLogin.disabled) {
        btnLogin.click();
      }
    }
  });

  // Add connection status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.id = 'connectionStatus';
  statusIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    display: none;
    background: rgba(0,0,0,0.8);
    color: white;
  `;
  document.body.appendChild(statusIndicator);

  // Function to show connection status
  function showConnectionStatus(message, type = 'info') {
    const indicator = document.getElementById('connectionStatus');
    if (indicator) {
      indicator.textContent = message;
      indicator.style.background = type === 'error' ? 'rgba(220,38,38,0.9)' :
                                   type === 'success' ? 'rgba(34,197,94,0.9)' :
                                   'rgba(0,0,0,0.8)';
      indicator.style.display = 'block';
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 5000);
    }
  }
}

// Initialize authentication manager
function initAuthManager() {
  initAuthListeners();
  checkAuthStatus();
}

// Export functions for use in other modules
window.AuthManager = {
  validateLogin,
  setAuthError,
  mapLoginError,
  performLogin,
  performLogout,
  checkAuthStatus,
  updateUIAfterLogin,
  initAuthManager,
  testConnection,
  showConnectionStatus
};
