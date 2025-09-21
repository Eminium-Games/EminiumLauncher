/**
 * OAuth Manager for Eminium Launcher
 * Handles OAuth 2.0 authentication with Croissant-API.fr
 */

// OAuth configuration
const OAUTH_CONFIG = {
  clientId: '2b90be46-3fdb-45f1-98bd-081b70cc3d9f',
  redirectUri: 'http://localhost:8080/callback?tab=play',
  authUrl: 'https://croissant-api.fr/oauth2/authorize',
  tokenUrl: 'https://croissant-api.fr/oauth2/token',
  userApiUrl: 'https://croissant-api.fr/api/user',
  scopes: ['user.read', 'balance.read']
};

// Open OAuth popup window
async function connectWithCroissant() {
  try {
    console.log('[Croissant] Début de la connexion OAuth...');
    
    // Generate random state for security
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('croissant_oauth_state', state);
    
    // Build authorization URL
    const authUrl = `${OAUTH_CONFIG.authUrl}?` +
      `client_id=${OAUTH_CONFIG.clientId}` +
      `&redirect_uri=${encodeURIComponent(OAUTH_CONFIG.redirectUri)}` +
      `&response_type=code` +
      `&state=${state}` +
      `&scope=${OAUTH_CONFIG.scopes.join(' ')}`;
    
    console.log('[Croissant] URL d\'autorisation:', authUrl);
    
    // Calculate popup dimensions
    const width = 500;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    
    const popup = window.open(
      authUrl,
      'CroissantOAuth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
    
    if (!popup) {
      console.error('[Croissant] Impossible d\'ouvrir la popup');
      alert('Veuillez autoriser les popups pour vous connecter avec Croissant');
      return;
    }
    
    // Monitor popup for closure
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        console.log('[Croissant] Popup fermée par l\'utilisateur');
      }
    }, 1000);
    
    // Listen for messages from popup
    const messageHandler = function(event) {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;
      
      if (event.data && event.data.type === 'croissant_oauth_result') {
        const { code, state: returnedState, error } = event.data;
        
        // Verify state
        const savedState = sessionStorage.getItem('croissant_oauth_state');
        if (returnedState !== savedState) {
          console.error('[Croissant] State invalide');
          return;
        }
        
        // Cleanup
        sessionStorage.removeItem('croissant_oauth_state');
        window.removeEventListener('message', messageHandler);
        clearInterval(checkClosed);
        
        if (error) {
          console.error('[Croissant] Erreur OAuth:', error);
          alert('Erreur d\'authentification: ' + error);
          return;
        }
        
        if (code) {
          // Process OAuth code
          processOAuthCode(code);
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    
  } catch (error) {
    console.error('[Croissant] Erreur:', error);
    alert('Erreur lors de la connexion: ' + error.message);
  }
}

// Process OAuth code received from popup
async function processOAuthCode(code) {
  try {
    console.log('[Croissant] Traitement du code OAuth...');
    
    // Exchange code for token
    const tokenResponse = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: OAUTH_CONFIG.clientId,
        redirect_uri: OAUTH_CONFIG.redirectUri
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Erreur ${tokenResponse.status}: ${tokenResponse.statusText}`);
    }
    
    const tokenData = await tokenResponse.json();
    console.log('[Croissant] Token obtenu:', tokenData);
    
    let userData = {};
    
    // Check if user info is in token (already connected case)
    if (tokenData.user) {
      console.log('[Croissant] Infos utilisateur trouvées dans le token');
      userData = tokenData.user;
    } else {
      // Otherwise, fetch user info via API
      console.log('[Croissant] Récupération des infos utilisateur via API...');
      const userResponse = await fetch(OAUTH_CONFIG.userApiUrl, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error(`Erreur ${userResponse.status}: ${userResponse.statusText}`);
      }
      
      userData = await userResponse.json();
      console.log('[Croissant] Utilisateur récupéré via API');
    }
    
    // Ensure we have essential data
    if (!userData.username || !userData.user_id) {
      console.warn('[Croissant] Données utilisateur incomplètes:', userData);
      throw new Error('Données utilisateur incomplètes reçues');
    }
    
    console.log('[Croissant] Données utilisateur complètes:', {
      username: userData.username,
      user_id: userData.user_id,
      email: userData.email,
      balance: userData.balance
    });
    
    // Process the user data
    await processCroissantUser(userData);
    
  } catch (error) {
    console.error('[Croissant] Erreur lors du traitement du code:', error);
    alert('Erreur lors du traitement de l\'authentification: ' + error.message);
  }
}

// Process Croissant user data and integrate with launcher
async function processCroissantUser(user) {
  try {
    console.log('[Croissant] Traitement des données utilisateur:', user);
    
    // Create a profile object compatible with the launcher
    const profile = {
      username: user.username,
      uuid: user.user_id,
      email: user.email,
      avatar: user.avatar || `https://minotar.net/helm/${user.username}/64`,
      grade: user.grade || { name: 'Membre' },
      balance: user.balance || 0,
      authProvider: 'croissant',
      accessToken: user.access_token,
      refreshToken: user.refresh_token
    };
    
    // Set the profile in the launcher
    const result = await window.eminium.setProfile(profile);
    
    if (result && result.ok) {
      console.log('[Croissant] Profil défini avec succès');
      
      // Update UI
      window.AuthManager.updateUIAfterLogin(profile);
      
      // Show success message
      window.Logger.success(`Connecté avec succès en tant que ${user.username}`);
      
      // Switch to play tab
      window.UIHelpers.switchToPlayTab();
      
      // Update points display if available
      if (user.balance !== undefined) {
        updatePointsDisplay(user.balance);
      }
      
    } else {
      throw new Error('Échec de la définition du profil');
    }
    
  } catch (error) {
    console.error('[Croissant] Erreur lors du traitement de l\'utilisateur:', error);
    alert('Erreur lors du traitement des données utilisateur: ' + error.message);
  }
}

// Update points display in the UI
function updatePointsDisplay(points) {
  if (window.DOMUtils) {
    window.DOMUtils.setText('userPoints', `${points} croissants`);
    window.DOMUtils.setDisplay('userPoints', 'inline-block');
  }
}

// Fetch and update points (if available)
async function fetchAndUpdatePoints() {
  try {
    // Check if user is authenticated with Croissant
    const profileResult = await window.eminium.getProfile();
    if (profileResult && profileResult.ok && profileResult.profile) {
      const profile = profileResult.profile;
      
      if (profile.authProvider === 'croissant' && profile.accessToken) {
        // Fetch user data to get current balance
        const userResponse = await fetch(OAUTH_CONFIG.userApiUrl, {
          headers: {
            'Authorization': `Bearer ${profile.accessToken}`
          }
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.balance !== undefined) {
            updatePointsDisplay(userData.balance);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Croissant] Erreur lors de la récupération des points:', error);
  }
}

// Handle OAuth callback parameters from URL
function handleCallbackParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');
  
  if (code && state) {
    // Handle OAuth callback
    handleOAuthCallback(code, state);
  } else if (error) {
    console.error('[Croissant] Erreur OAuth dans le callback:', error);
    alert('Erreur d\'authentification: ' + error);
  }
  
  // Check for tab parameter
  const tabParam = urlParams.get('tab');
  if (tabParam === 'play') {
    window.UIHelpers.switchToPlayTab();
  }
}

// Handle OAuth callback
async function handleOAuthCallback(code, state) {
  try {
    console.log('[Croissant] Traitement du callback OAuth...');
    
    // Verify state
    const savedState = sessionStorage.getItem('croissant_oauth_state');
    if (state !== savedState) {
      console.error('[Croissant] State invalide dans le callback');
      return;
    }
    
    // Clean up state
    sessionStorage.removeItem('croissant_oauth_state');
    
    // Clean up URL
    const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]code=[^&]*|&state=[^&]*/g, '');
    window.history.replaceState({}, document.title, cleanUrl);
    
    // Process the OAuth code
    await processOAuthCode(code);
    
  } catch (error) {
    console.error('[Croissant] Erreur lors du traitement du callback:', error);
    alert('Erreur lors du traitement de l\'authentification: ' + error.message);
  }
}

// Initialize OAuth event listeners
function initOAuthListeners() {
  if (window.DOMUtils) {
    window.DOMUtils.addEventListener('btnLoginWithCroissant', 'click', connectWithCroissant);
  }
}

// Initialize OAuth manager
function initOAuthManager() {
  initOAuthListeners();
  handleCallbackParams();
  
  // Set up periodic points update
  setInterval(fetchAndUpdatePoints, 30000); // Update every 30 seconds
}

// Export functions for use in other modules
window.OAuthManager = {
  connectWithCroissant,
  processOAuthCode,
  processCroissantUser,
  fetchAndUpdatePoints,
  handleCallbackParams,
  handleOAuthCallback,
  initOAuthManager
};
