/**
 * Authentication Manager for Eminium Launcher
 * Handles all authentication-related functionality
 */

// API URL configuration
const SITE_URL = 'https://eminium.ovh';

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
  const profileName = document.getElementById('userName');
  const profileRole = document.getElementById('userRole');
  const profileAvatar = document.getElementById('userAvatar');

  if (profileName) profileName.textContent = profile.username || profile.pseudo || 'Utilisateur';
  if (profileRole) {
    const gradeText = profile.grade || 'Membre';
    profileRole.textContent = gradeText;

    // Apply grade styling if available
    if (window.UIHelpers && window.UIHelpers.applyGradeStyle) {
      const gradeColor = window.UIHelpers.paletteColorForGrade(gradeText);
      window.UIHelpers.applyGradeStyle(profileRole, gradeColor, gradeText);
    }
  }

  // Update avatar with Minecraft head
  if (profileAvatar) {
    const username = profile.username || profile.pseudo || 'steve';
    profileAvatar.innerHTML = `<img src="https://minotar.net/helm/${username}/32" alt="Avatar ${username}" onerror="this.src='https://minotar.net/helm/steve/32'">`;

    // Add loading animation
    const img = profileAvatar.querySelector('img');
    if (img) {
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      img.onload = () => {
        img.style.opacity = '1';
      };
    }
  }

  // Show authenticated UI elements
  const userCard = document.getElementById('userCard');
  const logoutBtn = document.getElementById('logoutBtn');
  const playTab = document.getElementById('navPlay');
  const logsTab = document.getElementById('navLogs');

  if (userCard) userCard.style.display = 'flex';
  if (logoutBtn) logoutBtn.style.display = 'flex';
  if (playTab) playTab.style.display = 'flex';
  if (logsTab) logsTab.style.display = 'flex';

  // Hide auth UI elements
  const authTab = document.getElementById('navAuth');
  if (authTab) authTab.style.display = 'none';

  // Switch to play section
  const authSection = document.getElementById('authSection');
  const playSection = document.getElementById('playSection');
  const logsSection = document.getElementById('logsSection');

  if (authSection) authSection.style.display = 'none';
  if (playSection) playSection.style.display = 'block';
  if (logsSection) logsSection.style.display = 'none';

  // Update navigation active state
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if (playTab) playTab.classList.add('active');

  console.log('[Auth] UI updated for logged in user:', profile.username);
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
    // Show confirmation dialog
    const confirmed = confirm('Êtes-vous sûr de vouloir vous déconnecter ?');

    if (!confirmed) {
      return;
    }

    console.log('[Auth] Starting logout process...');

    // Disable logout button during logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Déconnexion...';
    }

    // Call logout API
    const result = await window.eminium.logout();

    if (result && result.ok) {
      console.log('[Auth] Logout successful');

      // Show success message
      if (window.Logger) {
        window.Logger.success('Déconnexion réussie');
      }

      // Reset UI
      resetUIAfterLogout();

      // Update app state if available
      if (window.App && window.App.getState) {
        const state = window.App.getState();
        if (state) {
          state.authenticated = false;
        }
      }

      // Show success notification
      if (window.UIHelpers && window.UIHelpers.showNotification) {
        window.UIHelpers.showNotification('Déconnexion réussie !', 'success');
      }
    } else {
      throw new Error(result?.error || 'Logout failed');
    }

  } catch (error) {
    console.error('[Auth] Logout error:', error.message);

    // Show error message
    if (window.Logger) {
      window.Logger.error('Erreur lors de la déconnexion: ' + error.message);
    }

    if (window.UIHelpers && window.UIHelpers.showNotification) {
      window.UIHelpers.showNotification('Erreur lors de la déconnexion', 'error');
    }

    // Re-enable logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.textContent = '🚪 Déconnexion';
    }
  }
}
// Complete logout and reset
async function completeLogout() {
  try {
    // Show confirmation
    const confirmed = confirm('Êtes-vous sûr de vouloir vous déconnecter ?');

    if (!confirmed) {
      return;
    }

    console.log('[Auth] Starting complete logout process...');

    // Disable logout button during logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Déconnexion...';
    }

    // Call logout API
    const result = await window.eminium.logout();

    if (result && result.ok) {
      console.log('[Auth] Logout successful');

      // Show success message
      if (window.Logger) {
        window.Logger.success('Déconnexion réussie');
      }

      // Complete UI reset
      resetUIAfterLogout();

      // Update app state if available
      if (window.App && window.App.getState) {
        const state = window.App.getState();
        if (state) {
          state.authenticated = false;
          // Clear any cached profile data
          state.userProfile = null;
        }
      }

      // Show success notification
      if (window.UIHelpers && window.UIHelpers.showNotification) {
        window.UIHelpers.showNotification('Déconnexion réussie ! Vous pouvez vous reconnecter.', 'success');
      }

      // Re-enable logout button after a short delay
      setTimeout(() => {
        if (logoutBtn) {
          logoutBtn.disabled = false;
          logoutBtn.textContent = '🚪 Déconnexion';
        }
      }, 1000);

    } else {
      throw new Error(result?.error || 'Logout failed');
    }

  } catch (error) {
    console.error('[Auth] Logout error:', error.message);

    // Show error message
    if (window.Logger) {
      window.Logger.error('Erreur lors de la déconnexion: ' + error.message);
    }

    if (window.UIHelpers && window.UIHelpers.showNotification) {
      window.UIHelpers.showNotification('Erreur lors de la déconnexion: ' + error.message, 'error');
    }

    // Re-enable logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.disabled = false;
    }
  }
}

// Check if user is logged in and update UI accordingly
async function checkAuthStatus() {
  try {
    console.log('[Auth] Checking authentication status...');

    const result = await window.eminium.getProfile();
    if (result && result.ok && result.profile) {
      console.log('[Auth] User is already logged in:', result.profile.username);

      // Update UI to show logged in state
      updateUIAfterLogin(result.profile);

      // Update app state if available
      if (window.App && window.App.getState) {
        const state = window.App.getState();
        if (state) {
          state.authenticated = true;
        }
      }

      return true;
    } else {
      console.log('[Auth] No active session found');

      // Update UI to show logged out state
      resetUIAfterLogout();

      // Update app state if available
      if (window.App && window.App.getState) {
        const state = window.App.getState();
        if (state) {
          state.authenticated = false;
        }
      }

      return false;
    }
  } catch (error) {
    console.warn('[Auth] Error checking auth status:', error);

    // If there's an error, assume not logged in and show auth UI
    resetUIAfterLogout();

    // Update app state if available
    if (window.App && window.App.getState) {
      const state = window.App.getState();
      if (state) {
        state.authenticated = false;
      }
    }

    return false;
  }
}

// Reset UI after logout
function resetUIAfterLogout() {
  // Reset profile display
  const profileName = document.getElementById('userName');
  const profileRole = document.getElementById('userRole');
  const profileAvatar = document.getElementById('userAvatar');

  if (profileName) profileName.textContent = 'Non connecté';
  if (profileRole) {
    profileRole.textContent = 'Visiteur';
    // Reset grade styling
    if (window.UIHelpers && window.UIHelpers.applyGradeStyle) {
      window.UIHelpers.applyGradeStyle(profileRole, '#64748b', 'Visiteur');
    }
  }
  if (profileAvatar) profileAvatar.innerHTML = '👤';

  // Hide authenticated UI elements
  const userCard = document.getElementById('userCard');
  const logoutBtn = document.getElementById('logoutBtn');
  const playTab = document.getElementById('navPlay');
  const logsTab = document.getElementById('navLogs');

  if (userCard) userCard.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (playTab) playTab.style.display = 'none';
  if (logsTab) logsTab.style.display = 'none';

  // Show auth UI elements
  const authTab = document.getElementById('navAuth');
  if (authTab) authTab.style.display = 'flex';

  // Switch to auth section
  const authSection = document.getElementById('authSection');
  const playSection = document.getElementById('playSection');
  const logsSection = document.getElementById('logsSection');

  if (authSection) authSection.style.display = 'block';
  if (playSection) playSection.style.display = 'none';
  if (logsSection) logsSection.style.display = 'none';

  // Update navigation active state
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if (authTab) authTab.classList.add('active');

  // Clear form fields
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const code2faInput = document.getElementById('code2fa');

  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (code2faInput) code2faInput.value = '';

  console.log('[Auth] UI reset for logged out state');
}

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

// Initialize authentication event listeners
function initAuthListeners() {
  if (!window.DOMUtils) {
    console.error('DOMUtils not available');
    return;
  }

  let loginInProgress = false;

  // Main login button
  window.DOMUtils.addEventListener('loginBtn', 'click', async () => {
    if (loginInProgress) {
      console.log('[Auth] Login already in progress, ignoring duplicate click');
      return;
    }

    loginInProgress = true;

    const email = window.DOMUtils.getValue('email', '').trim();
    const password = window.DOMUtils.getValue('password', '');
    const code2fa = window.DOMUtils.getValue('code2fa', '').trim();

    // Disable login button during login
    const loginButton = window.DOMUtils.getElement('loginBtn', false);
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
  window.DOMUtils.addEventListener('oauthBtn', 'click', () => {
    const detailedForm = window.DOMUtils.getElement('detailedLoginForm', false);
    const quickAuth = window.DOMUtils.getElement('quickAuth', false);

    if (detailedForm && quickAuth) {
      window.DOMUtils.toggle('detailedLoginForm', 'block');
      window.DOMUtils.toggle('quickAuth', 'block');
    }
  });

  // Logout button
  window.DOMUtils.addEventListener('logoutBtn', 'click', performLogout);

  // Handle Enter key in login form
  window.DOMUtils.addEventListener('loginForm', 'keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const btnLogin = window.DOMUtils.getElement('loginBtn', false);
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
