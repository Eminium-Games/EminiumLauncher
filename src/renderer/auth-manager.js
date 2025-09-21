/**
 * Authentication Manager for Eminium Launcher
 * Handles all authentication-related functionality
 */

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

// Action de connexion unifiée (réutilisable par un overlay)
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
  
  try {
    if (!quiet) {
      window.Logger.info('Tentative de connexion...');
    }
    
    const result = await window.eminium.login(email, pass, code2fa);
    
    if (result && result.ok) {
      if (!quiet) {
        window.Logger.success('Connexion réussie!');
        updateUIAfterLogin(result.profile);
        window.UIHelpers.setProfileSkeleton(false);
      }
      
      if (onSuccess) onSuccess(result.profile);
      return result.profile;
    } else {
      const errorMsg = mapLoginError(result);
      if (!quiet) {
        setAuthError(errorMsg);
        window.Logger.error('Échec de connexion: ' + errorMsg);
        window.UIHelpers.setProfileSkeleton(false);
      }
      
      if (onError) onError(errorMsg);
      return null;
    }
  } catch (error) {
    const errorMsg = mapLoginError(null, error);
    if (!quiet) {
      setAuthError(errorMsg);
      window.Logger.error('Erreur de connexion: ' + errorMsg);
      window.UIHelpers.setProfileSkeleton(false);
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
  
  // Main login button
  window.DOMUtils.addEventListener('btnLogin', 'click', async () => {
    const email = window.DOMUtils.getValue('email', '').trim();
    const password = window.DOMUtils.getValue('password', '');
    const code2fa = window.DOMUtils.getValue('code2fa', '').trim();
    
    await performLogin(email, password, code2fa);
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
      if (btnLogin) {
        btnLogin.click();
      }
    }
  });
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
  initAuthManager
};
