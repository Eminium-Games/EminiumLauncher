/**
 * Eminium Launcher - Application Principal
 * Interface moderne et professionnelle
 */

// Configuration
const CONFIG = {
    API_URL: 'https://croissant-api.fr',
    GAME_HOST: 'play.eminium.ovh',
    GAME_PORT: 25565
};

// État de l'application
let appState = {
    initialized: false,
    authenticated: false,
    user: null,
    currentTab: 'auth',
    serverOnline: false
};

// Utilitaires DOM
const DOM = {
    // Sélecteurs
    select: (selector) => document.querySelector(selector),
    selectAll: (selector) => document.querySelectorAll(selector),

    // Classes
    addClass: (element, className) => element?.classList.add(className),
    removeClass: (element, className) => element?.classList.remove(className),
    toggleClass: (element, className) => element?.classList.toggle(className),
    hasClass: (element, className) => element?.classList.contains(className),

    // Affichage
    show: (element) => {
        if (typeof element === 'string') {
            const el = DOM.select(element);
            if (el) el.style.display = 'block';
        } else if (element) {
            element.style.display = 'block';
        }
    },

    hide: (element) => {
        if (typeof element === 'string') {
            const el = DOM.select(element);
            if (el) el.style.display = 'none';
        } else if (element) {
            element.style.display = 'none';
        }
    },

    // Texte
    setText: (selector, text) => {
        const el = DOM.select(selector);
        if (el) el.textContent = text;
    },

    // Valeurs
    setValue: (selector, value) => {
        const el = DOM.select(selector);
        if (el) el.value = value;
    },

    getValue: (selector, defaultValue = '') => {
        const el = DOM.select(selector);
        return el ? el.value : defaultValue;
    },

    // Événements
    on: (selector, event, handler) => {
        const element = typeof selector === 'string' ? DOM.select(selector) : selector;
        if (element) {
            element.addEventListener(event, handler);
        }
    }
};

// Navigation
function initNavigation() {
    const navItems = DOM.selectAll('.nav-item');

    navItems.forEach(item => {
        DOM.on(item, 'click', () => {
            const tabId = item.dataset.tab;

            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Switch content
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Hide all sections
    DOM.selectAll('.content-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    // Show target section
    const targetSection = DOM.select(`#${tabId}Section`);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    }

    appState.currentTab = tabId;
    console.log(`[App] Switched to tab: ${tabId}`);
}

// Authentification
async function initAuthentication() {
    const loginForm = DOM.select('#loginForm');
    const loginBtn = DOM.select('#loginBtn');
    const oauthBtn = DOM.select('#oauthBtn');
    const logoutBtn = DOM.select('#logoutBtn');

    // Gestionnaire de soumission du formulaire
    DOM.on(loginForm, 'submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });

    // Bouton OAuth
    DOM.on(oauthBtn, 'click', () => {
        showStatus('OAuth non implémenté pour le moment', 'info');
    });

    // Bouton de déconnexion
    DOM.on(logoutBtn, 'click', async () => {
        await handleLogout();
    });
}

async function handleLogin() {
    const email = DOM.getValue('#email', '').trim();
    const password = DOM.getValue('#password', '');
    const code2fa = DOM.getValue('#code2fa', '').trim();

    if (!email || !password) {
        showStatus('Veuillez remplir tous les champs', 'error');
        return;
    }

    // Validation email
    if (!email.includes('@')) {
        showStatus('Adresse email invalide', 'error');
        return;
    }

    try {
        // Afficher l'état de chargement
        setLoadingState(true);

        // Test de connexion
        showStatus('Test de connexion...', 'info');

        const connectionTest = await testConnection();
        if (!connectionTest.ok) {
            showStatus(connectionTest.message, 'error');
            return;
        }

        // Tentative de connexion
        showStatus('Connexion en cours...', 'info');

        const result = await window.eminium?.login(email, password, code2fa);

        if (result && result.ok) {
            appState.authenticated = true;
            appState.user = result.profile;

            showStatus('Connexion réussie !', 'success');
            updateUserInterface(result.profile);
            switchTab('play');
        } else {
            const errorMsg = result?.error || 'Échec de la connexion';
            showStatus(errorMsg, 'error');
        }

    } catch (error) {
        console.error('[Auth] Login error:', error);
        showStatus('Erreur de connexion: ' + error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}

async function handleLogout() {
    try {
        await window.eminium?.logout();

        appState.authenticated = false;
        appState.user = null;

        updateUserInterface(null);
        switchTab('auth');
        showStatus('Déconnexion réussie', 'success');

    } catch (error) {
        console.error('[Auth] Logout error:', error);
        showStatus('Erreur lors de la déconnexion', 'error');
    }
}

async function testConnection() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/ping`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'EminiumLauncher/2.0'
            },
            signal: AbortSignal.timeout(5000)
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

function setLoadingState(loading) {
    const loginBtn = DOM.select('#loginBtn');
    const loginSpinner = DOM.select('#loginSpinner');
    const loginText = DOM.select('#loginText');

    if (loading) {
        loginBtn.disabled = true;
        loginSpinner.style.display = 'inline-block';
        loginText.textContent = 'Connexion...';
    } else {
        loginBtn.disabled = false;
        loginSpinner.style.display = 'none';
        loginText.textContent = 'Se connecter';
    }
}

function showStatus(message, type = 'info') {
    const statusElements = {
        error: DOM.select('#authError'),
        success: DOM.select('#authSuccess')
    };

    // Cacher tous les messages
    Object.values(statusElements).forEach(el => {
        if (el) {
            el.style.display = 'none';
            el.className = 'status-message';
        }
    });

    // Afficher le message approprié
    const statusEl = statusElements[type === 'error' ? 'error' : 'success'];
    if (statusEl && message) {
        statusEl.textContent = message;
        statusEl.classList.add(type);
        statusEl.style.display = 'block';
    }

    console.log(`[Status] ${type.toUpperCase()}: ${message}`);
}

function updateUserInterface(user) {
    const userCard = DOM.select('#userCard');
    const logoutBtn = DOM.select('#logoutBtn');
    const navAuth = DOM.select('#navAuth');
    const navPlay = DOM.select('#navPlay');
    const navLogs = DOM.select('#navLogs');

    if (user) {
        // Afficher les éléments connectés
        DOM.show(userCard);
        DOM.show(logoutBtn);
        DOM.hide(navAuth);
        DOM.show(navPlay);
        DOM.show(navLogs);

        // Mettre à jour les informations utilisateur
        DOM.setText('#userName', user.username || user.pseudo || 'Utilisateur');
        DOM.setText('#userRole', user.grade || 'Membre');

        const userAvatar = DOM.select('#userAvatar');
        if (userAvatar) {
            userAvatar.textContent = '👤'; // Placeholder
        }

        console.log('[UI] User interface updated for:', user.username);
    } else {
        // Afficher les éléments déconnectés
        DOM.hide(userCard);
        DOM.hide(logoutBtn);
        DOM.show(navAuth);
        DOM.hide(navPlay);
        DOM.hide(navLogs);

        // Réinitialiser les champs
        DOM.setValue('#email', '');
        DOM.setValue('#password', '');
        DOM.setValue('#code2fa', '');

        console.log('[UI] User interface reset');
    }
}

// Initialisation des paramètres de jeu
function initGameSettings() {
    const sliders = {
        memSlider: { element: '#memSlider', value: '#memValue', min: 1024, max: 8192, step: 256, default: 2048, unit: 'Mo' },
        renderSlider: { element: '#renderSlider', value: '#renderValue', min: 2, max: 32, step: 1, default: 12, unit: 'chunks' },
        fpsSlider: { element: '#fpsSlider', value: '#fpsValue', min: 30, max: 240, step: 10, default: 120, unit: 'FPS' }
    };

    // Initialiser les sliders
    Object.entries(sliders).forEach(([key, config]) => {
        const slider = DOM.select(config.element);
        const valueEl = DOM.select(config.value);

        if (slider && valueEl) {
            // Définir la valeur par défaut
            slider.value = config.default;
            updateSliderValue(slider, valueEl, config);

            // Écouter les changements
            DOM.on(slider, 'input', () => {
                updateSliderValue(slider, valueEl, config);
            });
        }
    });

    // Initialiser les toggles
    const toggles = [
        { id: 'vsyncToggle', input: '#vsyncInput' },
        { id: 'unlimitedFpsToggle', input: '#unlimitedFpsInput' },
        { id: 'closeOnPlayToggle', input: '#closeOnPlayInput' }
    ];

    toggles.forEach(({ id, input }) => {
        const toggle = DOM.select(`#${id}`);
        const inputEl = DOM.select(input);

        if (toggle && inputEl) {
            DOM.on(toggle, 'click', () => {
                inputEl.checked = !inputEl.checked;
                console.log(`[Settings] Toggle ${id}: ${inputEl.checked}`);
            });
        }
    });

    // Détecter la RAM système
    detectSystemRAM();
}

function updateSliderValue(slider, valueElement, config) {
    const value = parseInt(slider.value);
    let displayValue;

    if (config.unit === 'Mo') {
        displayValue = `${value} Mo`;
    } else if (config.unit === 'chunks') {
        displayValue = `${value} chunks`;
    } else if (config.unit === 'FPS') {
        displayValue = value === config.max ? 'Illimité' : `${value} FPS`;
    } else {
        displayValue = value;
    }

    valueElement.textContent = displayValue;
}

async function detectSystemRAM() {
    try {
        const result = await window.eminium?.getSystemRamMB();
        if (result?.ok) {
            const ramGB = Math.round(result.totalMB / 1024);
            DOM.setText('#ramInfo', `RAM système: ${ramGB} GB détecté`);

            // Ajuster automatiquement la mémoire recommandée
            const memSlider = DOM.select('#memSlider');
            if (memSlider && ramGB >= 4) {
                const recommended = Math.min(ramGB * 1024 * 0.6, 6144); // 60% de la RAM, max 6GB
                memSlider.value = Math.max(memSlider.min, Math.min(memSlider.max, recommended));
                updateSliderValue(memSlider, DOM.select('#memValue'), {
                    min: 1024, max: 8192, step: 256, unit: 'Mo'
                });
            }
        }
    } catch (error) {
        console.warn('[RAM] Detection failed:', error);
        DOM.setText('#ramInfo', 'RAM: Impossible de détecter');
    }
}

// Actions du jeu
function initGameActions() {
    const prepareBtn = DOM.select('#prepareBtn');
    const playBtn = DOM.select('#playBtn');

    DOM.on(prepareBtn, 'click', async () => {
        await prepareGame();
    });

    DOM.on(playBtn, 'click', async () => {
        await launchGame();
    });
}

async function prepareGame() {
    try {
        showProgressModal('Préparation du jeu...');

        const result = await window.eminium?.ensure();

        if (result?.ok) {
            log('✅ Préparation terminée', 'success');
            updateProgress(100, 'Jeu prêt !');
            setTimeout(() => hideProgressModal(), 1500);
        } else {
            throw new Error(result?.error || 'Échec de la préparation');
        }

    } catch (error) {
        console.error('[Prepare] Error:', error);
        log(`❌ Erreur: ${error.message}`, 'error');
        setTimeout(() => hideProgressModal(), 3000);
    }
}

async function launchGame() {
    const memoryMB = parseInt(DOM.getValue('#memSlider', '2048'));
    const serverHost = CONFIG.GAME_HOST;
    const serverPort = CONFIG.GAME_PORT;

    try {
        showProgressModal('Lancement du jeu...');

        const result = await window.eminium?.play({
            memoryMB,
            serverHost,
            serverPort
        });

        if (result?.ok) {
            log('✅ Jeu lancé avec succès', 'success');
            updateProgress(100, 'Jeu en cours...');

            // Fermer automatiquement si l'option est activée
            const closeOnPlay = DOM.select('#closeOnPlayInput')?.checked;
            if (closeOnPlay) {
                setTimeout(() => {
                    window.close();
                }, 2000);
            }
        } else {
            throw new Error(result?.error || 'Échec du lancement');
        }

    } catch (error) {
        console.error('[Launch] Error:', error);
        log(`❌ Erreur: ${error.message}`, 'error');
        setTimeout(() => hideProgressModal(), 3000);
    }
}

// Interface de progression
let progressModal = null;

function showProgressModal(title = 'Progression') {
    if (progressModal) return;

    progressModal = document.createElement('div');
    progressModal.className = 'modal-overlay';
    progressModal.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <div class="progress-stats">
                <div class="progress-stat">
                    <div id="modalProgress">0%</div>
                    <div>Progression</div>
                </div>
                <div class="progress-stat">
                    <div id="modalSpeed">0 MB/s</div>
                    <div>Vitesse</div>
                </div>
                <div class="progress-stat">
                    <div id="modalEta">--:--</div>
                    <div>Temps restant</div>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="modalProgressBar"></div>
            </div>
            <div class="progress-log" id="modalProgressLog"></div>
        </div>
    `;

    document.body.appendChild(progressModal);
    progressModal.style.display = 'flex';
}

function hideProgressModal() {
    if (progressModal) {
        progressModal.style.display = 'none';
        progressModal.remove();
        progressModal = null;
    }
}

function updateProgress(percent, message = '') {
    const progressBar = document.getElementById('modalProgressBar');
    const progressText = document.getElementById('modalProgress');
    const progressLog = document.getElementById('modalProgressLog');

    if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    if (progressText) {
        progressText.textContent = `${percent}%`;
    }

    if (message && progressLog) {
        log(message, percent >= 100 ? 'success' : 'info');
    }
}

function log(message, type = 'info') {
    const logsContainer = DOM.select('#logsContainer');
    const progressLog = DOM.select('#modalProgressLog');

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = message;

    // Ajouter aux deux containers de logs
    if (logsContainer) logsContainer.appendChild(logEntry.cloneNode(true));
    if (progressLog) progressLog.appendChild(logEntry);

    // Auto-scroll
    if (logsContainer) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    if (progressLog) {
        progressLog.scrollTop = progressLog.scrollHeight;
    }

    console.log(`[Log] ${type.toUpperCase()}: ${message}`);
}

// Initialisation de l'application
async function initializeApp() {
    try {
        console.log('[App] Initializing Eminium Launcher...');

        // Vérifier que les modules essentiels sont chargés
        if (!window.eminium) {
            console.error('[App] eminium API not loaded');
            showStatus('Erreur: API non chargée', 'error');
            return;
        }

        // Initialiser les composants dans l'ordre correct
        await initializeCoreSystems();

        // Initialiser l'interface
        initNavigation();
        initAuthentication();
        initGameSettings();
        initGameActions();

        // Vérifier le statut d'authentification
        await checkAuthStatus();

        // Démarrer la surveillance du serveur
        startServerMonitoring();

        console.log('[App] Initialization complete');

        appState.initialized = true;

    } catch (error) {
        console.error('[App] Initialization failed:', error);
        showStatus('Erreur d\'initialisation: ' + error.message, 'error');
    }
}

async function initializeCoreSystems() {
    try {
        // Initialiser les modules dans l'ordre
        const modules = [
            { name: 'UIHelpers', init: () => window.UIHelpers?.initUIHelpers() },
            { name: 'ErrorManager', init: () => window.ErrorManager },
            { name: 'Logger', init: () => window.Logger?.init() },
            { name: 'AuthManager', init: () => window.AuthManager?.initAuthManager() },
            { name: 'SettingsManager', init: () => window.SettingsManager?.initSettingsManager() },
            { name: 'ProgressUI', init: () => window.ProgressUI?.initProgressUI() },
            { name: 'UpdaterManager', init: () => window.UpdaterManager?.initUpdaterManager() }
        ];

        for (const module of modules) {
            try {
                console.log(`[App] Initializing ${module.name}...`);
                await module.init();
                console.log(`[App] ✓ ${module.name} initialized`);
            } catch (error) {
                console.warn(`[App] ⚠ ${module.name} initialization failed:`, error.message);
            }
        }

    } catch (error) {
        console.error('[App] Core systems initialization failed:', error);
        throw error;
    }
}

async function checkAuthStatus() {
    try {
        const result = await window.eminium?.getProfile();

        if (result && result.ok && result.profile) {
            appState.authenticated = true;
            appState.user = result.profile;

            updateUserInterface(result.profile);
            switchTab('play');

            console.log('[Auth] User already logged in:', result.profile.username);
        } else {
            switchTab('auth');
            console.log('[Auth] No user logged in');
        }

    } catch (error) {
        console.warn('[Auth] Status check failed:', error);
        switchTab('auth');
    }
}

function startServerMonitoring() {
    async function pingServer() {
        try {
            const result = await window.eminium?.ping(CONFIG.GAME_HOST, CONFIG.GAME_PORT, 3000);
            const isOnline = result?.up || false;

            if (isOnline !== appState.serverOnline) {
                appState.serverOnline = isOnline;
                log(`Serveur ${isOnline ? 'en ligne' : 'hors ligne'}`, isOnline ? 'success' : 'error');
            }

        } catch (error) {
            console.warn('[Ping] Server check failed:', error);
        }
    }

    // Ping initial
    pingServer();

    // Ping périodique
    setInterval(pingServer, 10000);
}

// Gestion des événements de visibilité
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('[App] Page hidden - pausing non-essential operations');
    } else {
        console.log('[App] Page visible - resuming operations');
    }
}

// Gestion du déchargement
function handleUnload() {
    console.log('[App] Unloading application');
}

// Raccourcis clavier
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // F5: Recharger l'application
        if (event.key === 'F5') {
            event.preventDefault();
            location.reload();
        }

        // Escape: Fermer les modales
        if (event.key === 'Escape') {
            if (progressModal) {
                hideProgressModal();
            }
        }

        // Ctrl+Shift+I: Ouvrir les outils de développement
        if (event.ctrlKey && event.shiftKey && event.key === 'I') {
            event.preventDefault();
            // Les outils de développement s'ouvriront automatiquement
        }
    });
}

// Point d'entrée
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[App] DOM ready, initializing...');
        initKeyboardShortcuts();
        initializeApp();
    });
} else {
    console.log('[App] DOM already loaded, initializing...');
    initKeyboardShortcuts();
    initializeApp();
}

// Export pour debug
window.EminiumApp = {
    state: appState,
    initializeApp,
    switchTab,
    showStatus,
    log,
    showProgressModal,
    hideProgressModal
};
