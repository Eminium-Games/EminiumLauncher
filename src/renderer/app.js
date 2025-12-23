// L'accès à ipcRenderer se fait maintenant via window.electronAPI

// Configuration du launcher
const CONFIG = {
  // Configuration du serveur Azuriom
api: {
  baseUrl: 'https://eminium.ovh',
  endpoints: {
    login: '/api/auth/authenticate',
    user: '/api/user/me',  // Modifié de '/api/users/me' à '/api/user/me'
    twoFactor: '/api/two-factor',
    verify2FA: '/api/two-factor/verify',
    servers: '/api/servers'
  }
},
  
  // Clés de stockage
  storageKeys: {
    authToken: 'authToken',
    refreshToken: 'refreshToken',
    userData: 'userData'
  },
  
  // Paramètres par défaut
  serverStatus: {
    online: false,
    players: 0,
    maxPlayers: 0,
    version: '1.20.1',
    lastUpdated: null
  },
  
  // Informations utilisateur
  user: null,
  authToken: localStorage.getItem('authToken') || null,
  refreshToken: localStorage.getItem('refreshToken') || null,
  
  // Paramètres du launcher
  settings: {
    memory: parseInt(localStorage.getItem('memoryAllocation')) || 4,
    fullscreen: localStorage.getItem('fullscreen') === 'true' || false,
    closeOnPlay: localStorage.getItem('closeOnPlay') !== 'false',
    notifications: localStorage.getItem('notifications') !== 'false',
    autoLogin: localStorage.getItem('autoLogin') === 'true' || false,
    rememberMe: localStorage.getItem('rememberMe') === 'true' || false
  }
};

// Éléments DOM
const elements = {};

// Initialisation de l'application
// Initialisation de l'application
async function init() {
  // Récupérer les éléments DOM
  elements.loginForm = document.getElementById('loginForm');
  elements.registerForm = document.getElementById('register-form');
  elements.emailInput = document.getElementById('email');
  elements.passwordInput = document.getElementById('password');
  elements.loginButton = document.querySelector('#loginForm button[type="submit"]');
  elements.logoutButton = document.getElementById('logout-button');
  elements.playButton = document.getElementById('play-button');
  elements.rememberMe = document.getElementById('rememberMe');
  elements.autoLogin = document.getElementById('autoLogin');
  elements.serverStatus = document.getElementById('server-status');
  elements.onlinePlayers = document.getElementById('online-players');
  elements.loginModal = document.getElementById('loginModal');
  elements.closeModal = document.querySelector('.close');
  elements.twoFactorForm = document.getElementById('two-factor-form');
  elements.twoFactorCode = document.getElementById('two-factor-code');
  elements.twoFactorBackButton = document.getElementById('two-factor-back');
  elements.twoFactorSubmitButton = document.getElementById('two-factor-submit');
  elements.twoFactorError = document.getElementById('two-factor-error');
  elements.userStatus = document.getElementById('userStatus');
  elements.username = document.getElementById('username');
  elements.userAvatar = document.getElementById('userAvatar');

  // Configurer les écouteurs d'événements
  setupEventListeners();

  // Vérifier si on a des identifiants enregistrés
  try {
    const credentials = await window.electronAPI.invoke('get-credentials');
    if (credentials && credentials.email) {
      elements.emailInput.value = credentials.email;
      elements.rememberMe.checked = true;
      elements.autoLogin.checked = credentials.autoLogin || false;
      
      // Si la connexion automatique est activée, on tente de se connecter
      if (credentials.autoLogin && credentials.token) {
        const success = await attemptAutoLogin(credentials);
        if (success) {
          return; // On arrête ici si la connexion automatique a réussi
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors du chargement des identifiants:', error);
  }

  // Vérifier si l'utilisateur est déjà connecté
  if (CONFIG.authToken) {
    try {
      await validateAuthToken();
      updateUI(true);
    } catch (error) {
      console.error('Erreur de validation de la session:', error);
      clearAuthData();
      updateUI(false);
    }
  } else {
    updateUI(false);
  }

  // Charger les paramètres
  loadSettings();

  // Démarrer la surveillance du statut du serveur
  startServerStatusPolling();
}

// Gérer la connexion réussie
async function handleSuccessfulLogin(authData) {
  // Mettre à jour les tokens dans la configuration
  CONFIG.authToken = authData.token;
  CONFIG.refreshToken = authData.refreshToken;

  // Sauvegarder les tokens dans le stockage local
  localStorage.setItem('authToken', authData.token);
  localStorage.setItem('refreshToken', authData.refreshToken);

  // Sauvegarder les identifiants si "Se souvenir de moi" est coché
  const rememberMe = elements.rememberMe && elements.rememberMe.checked;
  const autoLogin = elements.autoLogin && elements.autoLogin.checked;
  
  if (rememberMe) {
    try {
      await window.electronAPI.invoke('save-credentials', {
        email: elements.emailInput.value,
        token: authData.token,
        refreshToken: authData.refreshToken,
        rememberMe: true,
        autoLogin: autoLogin
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des identifiants:', error);
    }
  } else {
    // Effacer les identifiants enregistrés si "Se souvenir de moi" n'est pas coché
    try {
      await window.electronAPI.invoke('clear-credentials');
    } catch (error) {
      console.error('Erreur lors de la suppression des identifiants:', error);
    }
  }

  // Récupérer les informations du profil utilisateur
  try {
    await fetchUserProfile();
    updateUI(true);
    closeLoginModal();
    showToast('Connexion réussie', 'success');
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    showError('Erreur lors de la récupération du profil');
  }
}

// Mettre à jour l'interface utilisateur après la connexion
function updateUIAfterLogin(userData) {
  // Mettre à jour les informations utilisateur dans l'interface
  if (elements.username) {
    elements.username.textContent = userData.name || userData.email;
  }
  
  if (elements.userAvatar) {
    elements.userAvatar.src = userData.avatar || 'https://minotar.net/avatar/Steve/100.png';
  }
  
  // Masquer le bouton de connexion et afficher le bouton de déconnexion
  if (elements.loginButton) {
    elements.loginButton.style.display = 'none';
  }
  
  if (elements.logoutButton) {
    elements.logoutButton.style.display = 'block';
  }
  
  // Mettre à jour le statut de l'utilisateur
  if (elements.userStatus) {
    elements.userStatus.textContent = 'En ligne';
    elements.userStatus.classList.remove('offline');
    elements.userStatus.classList.add('online');
  }
  
  // Mettre à jour l'interface utilisateur
  updateUI(true);
}

// Afficher un message de chargement
function showLoading(message = 'Chargement...') {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.textContent = message;
    loadingElement.style.display = 'block';
  }
}

// Masquer le message de chargement
function hideLoading() {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
}

// Afficher le formulaire de connexion
function showLoginForm() {
  const loginModal = document.getElementById('loginModal');
  if (loginModal) {
    loginModal.style.display = 'flex';
  }
}

// Fermer la modale de connexion
function closeLoginModal() {
  const loginModal = document.getElementById('loginModal');
  if (loginModal) {
    loginModal.style.display = 'none';
  }
}

// Afficher un message d'erreur
function showError(message) {
  console.error(message);
  // Vous pouvez ajouter ici du code pour afficher un message d'erreur dans l'interface utilisateur
}

// Afficher une notification
function showToast(message, type = 'success') {
  console.log(`[${type}] ${message}`);
  // Vous pouvez ajouter ici du code pour afficher une notification dans l'interface utilisateur
}

  // Configurer les écouteurs d'événements
  setupEventListeners();

  // Vérifier s'il y a des identifiants enregistrés
  try {
    const credentials = await window.electronAPI.invoke('get-credentials');
    if (credentials && credentials.email && credentials.rememberMe) {
      // Pré-remplir l'email et cocher la case "Se souvenir de moi"
      elements.emailInput.value = credentials.email;
      elements.rememberMe.checked = true;

      // Si la connexion automatique est activée, tenter de se connecter automatiquement
      if (credentials.autoLogin) {
        elements.autoLogin.checked = true;
        elements.loginModal.style.display = 'flex';
        showLoading(true);

        try {
          const result = await window.electronAPI.invoke('auth:login', {
            email: credentials.email,
            password: '', // Le mot de passe n'est pas stocké
            token: credentials.token,
            refreshToken: credentials.refreshToken,
            rememberMe: true
          });

          if (result.success) {
            await handleSuccessfulLogin(result.data);
            showToast('Connexion automatique réussie', 'success');
          } else {
            // Si la connexion automatique échoue, afficher le formulaire de connexion
            showToast('Veuillez vous reconnecter', 'warning');
            elements.loginModal.style.display = 'flex';
          }
        } catch (error) {
          console.error('Erreur lors de la connexion automatique:', error);
          showToast('Échec de la connexion automatique', 'error');
          elements.loginModal.style.display = 'flex';
        } finally {
          showLoading(false);
        }
      } else {
        // Afficher la modale de connexion avec l'email pré-rempli
        elements.loginModal.style.display = 'flex';
      }
    } else if (!CONFIG.authToken) {
      // Aucune session active et pas d'identifiants enregistrés
      elements.loginModal.style.display = 'flex';
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des identifiants:', error);
    elements.loginModal.style.display = 'flex';
  }

  // Vérifier si l'utilisateur est déjà connecté
  if (CONFIG.authToken) {
    try {
      await validateAuthToken();
      updateUI(true);
    } catch (error) {
      console.error('Erreur de validation de la session:', error);
      clearAuthData();
      updateUI(false);
    }
  } else {
    updateUI(false);
  }

  // Charger les paramètres
  loadSettings();

  // Démarrer la surveillance du statut du serveur
  startServerStatusPolling();

  // Simuler le statut du serveur (à remplacer par un appel API réel)
  simulateServerStatus();


// Fonction pour tenter une connexion automatique
async function attemptAutoLogin(credentials) {
  try {
    showLoading('Connexion automatique en cours...');
    
    // Utiliser le token pour se connecter automatiquement
    const result = await window.electronAPI.invoke('auth:login-with-token', {
      email: credentials.email,
      token: credentials.token
    });
    
    if (result.success) {
      // Mettre à jour l'interface utilisateur
      updateUIAfterLogin(result.user);
      showToast('Connexion automatique réussie', 'success');
      return true;
    } else {
      // En cas d'échec, afficher le formulaire de connexion
      if (result.error === 'token_expired') {
        showError('Votre session a expiré, veuillez vous reconnecter');
      }
      return false;
    }
  } catch (error) {
    console.error('Erreur lors de la connexion automatique:', error);
    return false;
  } finally {
    hideLoading();
  }
}

// Gérer la connexion réussie
async function handleSuccessfulLogin(authData) {
  // Mettre à jour les tokens dans la configuration
  CONFIG.authToken = authData.token;
  CONFIG.refreshToken = authData.refreshToken;

  // Sauvegarder les tokens dans le stockage local
  localStorage.setItem('authToken', authData.token);
  localStorage.setItem('refreshToken', authData.refreshToken);

  // Sauvegarder les identifiants si "Se souvenir de moi" est coché
  const rememberMe = elements.rememberMe.checked;
  if (rememberMe) {
    try {
      await window.electronAPI.invoke('save-credentials', {
        email: elements.emailInput.value,
        token: authData.token,
        refreshToken: authData.refreshToken,
        rememberMe: true,
        autoLogin: elements.autoLogin.checked
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des identifiants:', error);
      // Ne pas bloquer le processus de connexion en cas d'erreur
    }
  } else {
    // Effacer les identifiants enregistrés si "Se souvenir de moi" n'est pas coché
    try {
      await window.electronAPI.invoke('clear-credentials');
    } catch (error) {
      console.error('Erreur lors de la suppression des identifiants:', error);
    }
  }

  // Récupérer les informations du profil utilisateur
  try {
    await fetchUserProfile();
    updateUI(true);
    closeLoginModal();
    showToast('Connexion réussie', 'success');
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    showError('Erreur lors de la récupération du profil');
  }
}

// Déconnexion
async function logout() {
  try {
    // Effacer les identifiants enregistrés
    await window.electronAPI.invoke('clear-credentials');
  } catch (error) {
    console.error('Erreur lors de la suppression des identifiants:', error);
  }

  // Effacer les données d'authentification
  clearAuthData();

  // Mettre à jour l'interface utilisateur
  updateUI(false);

  // Afficher la modale de connexion
  elements.loginModal.style.display = 'flex';

  // Afficher un message de déconnexion
  showToast('Déconnexion réussie', 'success');

  // Réinitialiser le formulaire de connexion
  if (elements.loginForm) {
    elements.loginForm.reset();
  }

  // Réinitialiser le formulaire 2FA s'il est affiché
  if (elements.twoFactorForm) {
    elements.twoFactorForm.style.display = 'none';
    elements.loginForm.style.display = 'block';
    elements.twoFactorCode.value = '';
  }

  // Réinitialiser l'état de la connexion
  CONFIG.user = null;
  CONFIG.authToken = null;
  CONFIG.refreshToken = null;

  // Effacer les données de session du navigateur
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
}

// Gérer la réponse de l'API
async function handleApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    let errorMessage = data.message || 'Une erreur est survenue';
    
    // Gérer les erreurs spécifiques
    if (response.status === 401) {
      errorMessage = 'Session expirée. Veuillez vous reconnecter.';
      logout();
    } else if (response.status === 403) {
      errorMessage = 'Accès refusé. Vérifiez vos permissions.';
    } else if (response.status === 422) {
      // Vérifier si c'est une erreur 2FA
      if (data.error === '2fa_required' || data.error === '2fa_invalid') {
        const error = new Error(data.message || 'Code 2FA requis');
        error.status = response.status;
        error.code = data.error;
        error.data = data;
        throw error;
      }
      
      // Erreurs de validation standard
      const validationErrors = Object.values(data.errors || {}).flat();
      if (validationErrors.length > 0) {
        errorMessage = validationErrors.join('\n');
      }
    }
    
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
}

// Valider le token d'authentification
async function validateAuthToken() {
  if (!CONFIG.authToken) return false;
  
  try {
    const response = await fetch(`${CONFIG.api.baseUrl}${CONFIG.api.endpoints.user}`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.authToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      CONFIG.user = userData;
      return true;
    }
    
    // Si le token a expiré, essayer de le rafraîchir
    if (response.status === 401 && CONFIG.refreshToken) {
      return await refreshAuthToken();
    }
    
    return false;
  } catch (error) {
    console.error('Erreur de validation du token:', error);
    return false;
  }
}

// Rafraîchir le token d'authentification
async function refreshAuthToken() {
  if (!CONFIG.refreshToken) return false;
  
  try {
    const response = await fetch(`${CONFIG.api.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: CONFIG.refreshToken
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      CONFIG.authToken = data.token;
      CONFIG.refreshToken = data.refresh_token;
      
      // Mettre à jour le stockage local
      if (CONFIG.settings.rememberMe) {
        localStorage.setItem('authToken', CONFIG.authToken);
        localStorage.setItem('refreshToken', CONFIG.refreshToken);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error);
    return false;
  }
}

// Récupérer le profil utilisateur
async function fetchUserProfile() {
  if (!CONFIG.authToken) {
    console.log('Aucun token d\'authentification trouvé');
    return null;
  }

  try {
    const url = `${CONFIG.api.baseUrl}${CONFIG.api.endpoints.user}`;
console.log('Tentative de récupération du profil depuis:', url);

const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

if (CONFIG.authToken) {
  headers['Authorization'] = `Bearer ${CONFIG.authToken}`;
}

    console.log('En-têtes de la requête:', headers);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      credentials: 'include' // Important pour les cookies de session
    });

    console.log('Réponse du serveur:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('Non autorisé - Déconnexion...');
        clearAuthData();
        return null;
      }

      const errorText = await response.text();
      console.error('Erreur de l\'API:', errorText);
      
      // Essayer de parser l'erreur comme JSON
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`);
      } catch (e) {
        throw new Error(`Erreur HTTP: ${response.status} - ${response.statusText || 'Erreur inconnue'}`);
      }
    }

    const userData = await response.json();
    console.log('Données utilisateur reçues:', userData);

    if (!userData || (typeof userData === 'object' && Object.keys(userData).length === 0)) {
      console.warn('Aucune donnée utilisateur valide reçue');
      return null;
    }

    // Mettre à jour les données utilisateur
    CONFIG.user = {
  id: userData.id,
  username: userData.name || userData.username || 'Joueur',
  email: userData.email,
  avatar: userData.avatar || `https://minotar.net/avatar/${encodeURIComponent(userData.name || 'Steve')}/64`,
  role: userData.role,
  ...userData
};

if (CONFIG.settings.rememberMe) {
  localStorage.setItem(CONFIG.storageKeys.userData, JSON.stringify(CONFIG.user));
}

    updateUI();
    return userData;

  } catch (error) {
  console.error('Erreur lors de la récupération du profil:', error);
  if (!error.message.includes('401')) {
    showToast('Erreur lors du chargement du profil: ' + error.message, 'error');
  }
  return null;
}
}

// Récupérer le statut des serveurs
async function fetchServerStatus() {
  try {
    // Utiliser le nouvel endpoint
    const response = await fetch('https://eminium.ovh/api/servers');
    const data = await handleApiResponse(response);
    
    // Extraire les informations du serveur par défaut
    const serverData = data?.default || data?.servers?.[0];
    
    // Mettre à jour le statut du serveur
    CONFIG.serverStatus = {
      online: serverData?.online || false,
      players: serverData?.players || 0,
      maxPlayers: serverData?.max_players || 0,
      version: '1.20.1',
      lastUpdated: new Date()
    };
    
    // Mettre à jour l'interface utilisateur
    updateServerStatusUI();
    
    return CONFIG.serverStatus;
  } catch (error) {
    console.error('Erreur lors de la récupération du statut des serveurs:', error);
    
    // Réinitialiser le statut en cas d'erreur
    CONFIG.serverStatus = {
      online: false,
      players: 0,
      maxPlayers: 0,
      version: '1.20.1',
      lastUpdated: null
    };
    
    // Mettre à jour l'interface utilisateur avec le statut d'erreur
    updateServerStatusUI();
    
    return CONFIG.serverStatus;
  }
}

// Démarrer la surveillance périodique du statut des serveurs
function startServerStatusPolling() {
  // Mettre à jour immédiatement
  fetchServerStatus().catch(console.error);
  
  // Puis mettre à jour toutes les 60 secondes
  setInterval(() => {
    fetchServerStatus().catch(console.error);
  }, 60000);
}

// Démarrer l'application lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', init);
