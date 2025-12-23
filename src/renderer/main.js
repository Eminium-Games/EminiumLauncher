// Configuration d'AzAuth
const AZAUTH_CONFIG = {
    baseUrl: 'https://eminium.ovh',
    authEndpoint: '/api/auth/authenticate',
    verifyEndpoint: '/api/auth/verify',
    logoutEndpoint: '/api/auth/logout'
};

// Configuration de base
document.addEventListener('DOMContentLoaded', async () => {
    // Initialisation des composants
    initNavigation();
    initLoginModal();
    initSettings();
    initGameLaunch();
    
    try {
        // Vérifier si l'utilisateur est déjà connecté
        await checkAuth();
        
        // Mettre à jour le statut du serveur
        await updateServerStatus();
        
        // Mettre à jour le statut du serveur toutes les minutes
        setInterval(updateServerStatus, 60000);
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
        showToast('Erreur lors du chargement des données', 'error');
    }
});

// Gestion de la navigation entre les onglets
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Retirer la classe active de tous les éléments de navigation
            navItems.forEach(navItem => navItem.classList.remove('active'));
            
            // Ajouter la classe active à l'élément cliqué
            item.classList.add('active');
            
            // Masquer tous les contenus d'onglets
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Afficher le contenu de l'onglet correspondant
            const targetTab = item.getAttribute('data-tab');
            if (targetTab) {
                const tabToShow = document.getElementById(targetTab);
                if (tabToShow) {
                    tabToShow.classList.add('active');
                }
            }
        });
    });
}

// Gestion de la modale de connexion
function initLoginModal() {
    const loginBtn = document.getElementById('btnLogin');
    const modal = document.getElementById('loginModal');
    const closeBtn = document.querySelector('.close');
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');
    const loginBtnModal = loginForm?.querySelector('.btn-primary');

    // Afficher la modale de connexion
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => {
                    modal.classList.add('show');
                }, 10);
            }
        });
    }

    // Fermer la modale
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            }
        });
    }

    // Fermer en cliquant en dehors de la modale
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    });

    // Gestion de la soumission du formulaire
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // La logique de connexion est gérée par app.js
            // Cette partie est maintenant obsolète
        });
        
        // Ajouter un gestionnaire pour le bouton d'inscription
        const registerBtn = document.getElementById('btnRegister');
        if (registerBtn) {
            registerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.open('https://eminium.ovh/register', '_blank');
            });
        }
    }
    
    // Fonction pour afficher les messages d'erreur
    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.add('show');
            
            // Masquer le message après 5 secondes
            setTimeout(() => {
                errorMessage.classList.remove('show');
            }, 5000);
        }
    }
}

// Fonction utilitaire pour afficher les erreurs
function showError(message) {
    console.error(message);
    showToast(message, 'error');
}

// Fonction utilitaire pour les requêtes API
async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erreur HTTP: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        showError(`Erreur de requête: ${error.message}`);
        throw error;
    }
}

// Gestion de l'authentification avec AzAuth
class AuthManager {
    static async login(email, password) {
        try {
            const response = await makeRequest(
                `${AZAUTH_CONFIG.baseUrl}${AZAUTH_CONFIG.authEndpoint}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                }
            );

            if (response.status === 'pending' && response.requires2fa) {
                const twoFactorCode = prompt('Veuillez entrer votre code 2FA :');
                if (!twoFactorCode) {
                    throw new Error('Code 2FA requis');
                }
                
                // Se reconnecter avec le code 2FA
                return this.login(email, password, twoFactorCode);
            }

            if (response.access_token) {
                localStorage.setItem('auth_token', response.access_token);
                await this.verify(); // Vérifier et récupérer les données utilisateur
                showToast('Connexion réussie !', 'success');
                return response;
            }

            throw new Error('Réponse inattendue du serveur');
        } catch (error) {
            showError(`Erreur de connexion: ${error.message}`);
            throw error;
        }
    }

    static async verify() {
        const token = localStorage.getItem('auth_token');
        if (!token) return null;

        try {
            const userData = await makeRequest(
                `${AZAUTH_CONFIG.baseUrl}${AZAUTH_CONFIG.verifyEndpoint}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ access_token: token })
                }
            );

            updateUserPanel(userData);
            return userData;
        } catch (error) {
            localStorage.removeItem('auth_token');
            updateUserPanel(null);
            throw error;
        }
    }

    static async logout() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        try {
            await makeRequest(
                `${AZAUTH_CONFIG.baseUrl}${AZAUTH_CONFIG.logoutEndpoint}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ access_token: token })
                }
            );
        } catch (error) {
            console.error('Erreur lors de la déconnexion:', error);
        } finally {
            localStorage.removeItem('auth_token');
            updateUserPanel(null);
            showToast('Vous avez été déconnecté', 'info');
        }
    }
}

// Vérifier si l'utilisateur est connecté au chargement
async function checkAuth() {
    try {
        const user = await AuthManager.verify();
        return user !== null;
    } catch (error) {
        return false;
    }
}

// Mettre à jour le panneau utilisateur après connexion
function updateUserPanel(userData) {
    const userPanel = document.querySelector('.user-panel');
    const loginBtn = document.getElementById('btnLogin');
    const userInfo = document.querySelector('.user-info');
    const usernameSpan = document.querySelector('.username');
    const userRole = document.querySelector('.user-role');

    if (userData) {
        // Mettre à jour les informations utilisateur
        if (usernameSpan) usernameSpan.textContent = userData.username || userData.name || 'Utilisateur';
        
        if (userRole) {
            if (userData.role) {
                userRole.textContent = userData.role.name || 'Membre';
                if (userData.role.color) {
                    userRole.style.color = userData.role.color;
                }
            } else {
                userRole.textContent = 'Membre';
                userRole.style.color = '';
            }
        }
        
        if (loginBtn) {
            loginBtn.textContent = 'Déconnexion';
            loginBtn.onclick = () => AuthManager.logout();
        }
        
        if (userPanel) userPanel.style.display = 'block';
        if (userInfo) userInfo.style.display = 'flex';
    } else {
        // Réinitialiser l'interface utilisateur
        if (usernameSpan) usernameSpan.textContent = 'Invité';
        if (userRole) {
            userRole.textContent = 'Non connecté';
            userRole.style.color = '';
        }
        
        if (loginBtn) {
            loginBtn.textContent = 'Connexion';
            loginBtn.onclick = showLoginForm;
        }
        
        if (userPanel) userPanel.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';
    }
}

// Gestion des paramètres
function initSettings() {
    const ramSlider = document.getElementById('ramSlider');
    const ramValue = document.getElementById('ramValue');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    // Mettre à jour la valeur de la RAM affichée
    if (ramSlider && ramValue) {
        ramSlider.addEventListener('input', () => {
            ramValue.textContent = `${ramSlider.value} Go`;
        });
    }
    
    // Sauvegarder les paramètres lorsque modifiés
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', saveSettings);
    });
    
    if (ramSlider) {
        ramSlider.addEventListener('change', saveSettings);
    }
    
    // Charger les paramètres sauvegardés
    loadSettings();
}

// Sauvegarder les paramètres
function saveSettings() {
    try {
        const ramSlider = document.getElementById('ramSlider');
        const fullscreen = document.getElementById('fullscreen');
        const autoConnect = document.getElementById('autoConnect');
        const keepLauncherOpen = document.getElementById('keepLauncherOpen');
        const showFps = document.getElementById('showFps');
        
        if (!ramSlider || !fullscreen || !autoConnect || !keepLauncherOpen || !showFps) {
            console.warn('Certains éléments de paramètres sont manquants');
            return;
        }
        
        const settings = {
            ram: ramSlider.value,
            fullscreen: fullscreen.checked,
            autoConnect: autoConnect.checked,
            keepLauncherOpen: keepLauncherOpen.checked,
            showFps: showFps.checked
        };
        
        localStorage.setItem('launcherSettings', JSON.stringify(settings));
        showToast('Paramètres sauvegardés', 'success');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des paramètres:', error);
        showToast('Erreur lors de la sauvegarde des paramètres', 'error');
    }
}

// Charger les paramètres sauvegardés
function loadSettings() {
    const savedSettings = localStorage.getItem('launcherSettings');
    
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            
            // Mettre à jour uniquement les éléments qui existent
            const ramSlider = document.getElementById('ramSlider');
            const ramValue = document.getElementById('ramValue');
            const fullscreen = document.getElementById('fullscreen');
            const autoConnect = document.getElementById('autoConnect');
            const keepLauncherOpen = document.getElementById('keepLauncherOpen');
            
            if (settings.ram && ramSlider && ramValue) {
                ramSlider.value = settings.ram;
                ramValue.textContent = `${settings.ram} Go`;
            }
            
            if (settings.fullscreen !== undefined && fullscreen) {
                fullscreen.checked = settings.fullscreen;
            }
            
            if (settings.autoConnect !== undefined && autoConnect) {
                autoConnect.checked = settings.autoConnect;
            }
            
            if (settings.keepLauncherOpen !== undefined && keepLauncherOpen) {
                keepLauncherOpen.checked = settings.keepLauncherOpen;
            }
            
            if (settings.showFps !== undefined) {
                document.getElementById('showFps').checked = settings.showFps;
            }
        } catch (e) {
            console.error('Erreur lors du chargement des paramètres:', e);
        }
    }
}

// Gestion du lancement du jeu
function initGameLaunch() {
    const playBtn = document.querySelector('.btn-play');
    const progressBar = document.querySelector('.progress');
    
    if (playBtn) {
        playBtn.addEventListener('click', async () => {
            // Vérifier si l'utilisateur est connecté
            const isLoggedIn = document.querySelector('.user-panel').style.display === 'flex';
            
            if (!isLoggedIn) {
                // Afficher la modale de connexion si l'utilisateur n'est pas connecté
                const loginBtn = document.querySelector('.btn-login');
                if (loginBtn) loginBtn.click();
                return;
            }
            
            // Désactiver le bouton et afficher l'indicateur de chargement
            playBtn.disabled = true;
            playBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Préparation...';
            
            // Simuler la préparation du jeu
            await simulateGamePreparation(progressBar);
            
            // Mettre à jour le bouton pour lancer le jeu
            playBtn.innerHTML = '<i class="fas fa-play"></i> Jouer';
            playBtn.disabled = false;
            
            // Simuler le lancement du jeu
            playBtn.addEventListener('click', launchGame, { once: true });
        });
    }
}

// Simuler la préparation du jeu
async function simulateGamePreparation(progressBar) {
    return new Promise(resolve => {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress > 100) progress = 100;
            
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            if (progress === 100) {
                clearInterval(interval);
                resolve();
            }
        }, 200);
    });
}

// Lancer le jeu
function launchGame() {
    showToast('Lancement du jeu...', 'info');
    
    // Ici, vous devrez implémenter la logique de lancement du jeu
    // Par exemple, utiliser l'API Electron pour lancer le jeu
    console.log('Lancement du jeu...');
    
    // Simuler un chargement
    setTimeout(() => {
        showToast('Le jeu est prêt !', 'success');
    }, 2000);
}

// Mettre à jour le statut du serveur
async function updateServerStatus() {
    const statusElement = document.getElementById('serverStatus');
    const playersElement = document.getElementById('onlinePlayers');
    
    if (!statusElement || !playersElement) return;
    
    try {
        const data = await makeRequest(`${AZAUTH_CONFIG.baseUrl}/api/servers/status`);
        
        if (data && typeof data.online !== 'undefined') {
            if (data.online) {
                statusElement.textContent = 'En ligne';
                statusElement.className = 'status-indicator online';
                playersElement.textContent = data.players || 0;
            } else {
                statusElement.textContent = 'Hors ligne';
                statusElement.className = 'status-indicator offline';
                playersElement.textContent = '0';
            }
        } else {
            throw new Error('Format de réponse invalide');
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut du serveur:', error);
    }
}

// Afficher une notification toast
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    else if (type === 'error') icon = 'exclamation-circle';
    else if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <div class="toast-message">${message}</div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Afficher le toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Supprimer le toast après 5 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
}

// Initialiser le chargement des polices
function loadFonts() {
    // Charger la police Inter depuis Google Fonts
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    // Charger Font Awesome pour les icônes
    const fontAwesome = document.createElement('link');
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    fontAwesome.rel = 'stylesheet';
    document.head.appendChild(fontAwesome);
}

// Charger les polices au démarrage
loadFonts();
