const { ipcRenderer } = require('electron');
const path = require('path');
const configManager = require('./configManager');

// Éléments du DOM
const elements = {
    language: document.getElementById('language'),
    autoConnect: document.getElementById('autoConnect'),
    keepLauncherOpen: document.getElementById('keepLauncherOpen'),
    javaPath: document.getElementById('javaPath'),
    jvmArgs: document.getElementById('jvmArgs'),
    gameDir: document.getElementById('gameDir'),
    browseJava: document.getElementById('browseJava'),
    browseGameDir: document.getElementById('browseGameDir'),
    saveBtn: document.getElementById('saveSettings'),
    cancelBtn: document.getElementById('cancelSettings'),
    resetBtn: document.getElementById('resetSettings')
};

// Charger la configuration
function loadSettings() {
    const config = configManager.load();
    
    // Général
    elements.language.value = config.settings.language || 'fr_FR';
    elements.autoConnect.checked = config.settings.autoConnect || false;
    elements.keepLauncherOpen.checked = config.settings.keepLauncherOpen !== false; // true par défaut
    
    // Jeu
    elements.javaPath.value = config.game.javaPath || '';
    elements.jvmArgs.value = config.game.jvmArgs || '-Xmx2G -Xms1G';
    elements.gameDir.value = config.game.gameDir || path.join(require('os').homedir(), 'AppData', 'Roaming', '.minecraft');
}

// Sauvegarder les paramètres
async function saveSettings() {
    const config = {
        settings: {
            language: elements.language.value,
            autoConnect: elements.autoConnect.checked,
            keepLauncherOpen: elements.keepLauncherOpen.checked
        },
        game: {
            javaPath: elements.javaPath.value,
            jvmArgs: elements.jvmArgs.value,
            gameDir: elements.gameDir.value
        }
    };

    try {
        await configManager.set('settings', config.settings);
        await configManager.set('game', config.game);
        
        // Envoyer un événement de mise à jour aux autres fenêtres
        ipcRenderer.send('config-updated', config);
        
        showToast('Paramètres enregistrés avec succès', 'success');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des paramètres:', error);
        showToast('Erreur lors de la sauvegarde des paramètres', 'error');
    }
}

// Gestionnaires d'événements
elements.browseJava.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-file-dialog', {
        properties: ['openFile'],
        filters: [
            { name: 'Exécutable Java', extensions: ['exe'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        elements.javaPath.value = result.filePaths[0];
    }
});

elements.browseGameDir.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-dialog', {
        properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        elements.gameDir.value = result.filePaths[0];
    }
});

elements.saveBtn.addEventListener('click', saveSettings);

elements.cancelBtn.addEventListener('click', () => {
    window.close();
});

elements.resetBtn.addEventListener('click', () => {
    if (confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
        configManager.reset();
        loadSettings();
        showToast('Paramètres réinitialisés', 'info');
    }
});

// Fonction utilitaire pour afficher des notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, 100);
}

// Charger les paramètres au démarrage
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    
    // Gérer la fermeture de la fenêtre
    ipcRenderer.on('window-close', () => {
        window.close();
    });
});
