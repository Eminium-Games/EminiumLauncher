const RPC = require('discord-rpc');

// Configuration du RPC Discord
const DISCORD_CLIENT_ID = '1484903800266293379'; // ID d'application Discord (ton ID)
const ENABLE_DISCORD_RPC = true; // Mettre à false pour désactiver le RPC

// IDs de fallback si le principal ne fonctionne pas
const FALLBACK_DISCORD_IDS = [
  '1484903800266293379', // Ton ID principal
  '1400888551486521454', // ID de fallback 1
  '1234567890123456789', // ID de fallback 2
  '9876543210987654321'  // ID de fallback 3
];
const DISCORD_START_TIME = new Date();

let rpcClient = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3; // Limite de tentatives par session

// Tenter de se connecter avec un ID spécifique
async function connectWithClientId(clientId, attempt = 1) {
  try {
    console.log(`[RPC] Tentative de connexion avec ID: ${clientId} (essai ${attempt})`);
    
    // Créer un nouveau client RPC
    const client = new RPC.Client({ transport: 'ipc' });
    
    // Configurer les événements
    client.on('ready', () => {
      console.log(`[RPC] Connecté à Discord avec succès (ID: ${clientId})`);
      rpcClient = client;
      isConnected = true;
      connectionAttempts = 0; // Réinitialiser les tentatives en cas de succès
      updatePresence('idle'); // État par défaut
    });
    
    client.on('disconnected', () => {
      console.log('[RPC] Déconnecté de Discord');
      isConnected = false;
      rpcClient = null;
    });
    
    client.on('error', (error) => {
      console.error(`[RPC] Erreur RPC (ID: ${clientId}):`, error.message);
      isConnected = false;
      rpcClient = null;
    });
    
    // Connexion avec timeout
    await Promise.race([
      client.login({ clientId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
    
    return true;
  } catch (error) {
    console.error(`[RPC] Échec de connexion (ID: ${clientId}):`, error.message);
    return false;
  }
}

// Initialiser le RPC Discord avec fallback
async function initializeDiscordRPC() {
  try {
    if (!ENABLE_DISCORD_RPC) {
      console.log('[RPC] RPC Discord désactivé manuellement');
      return false;
    }
    
    // Limiter les tentatives de connexion
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      console.log(`[RPC] Limite de tentatives atteinte (${MAX_CONNECTION_ATTEMPTS}), RPC désactivé pour cette session`);
      return false;
    }
    
    connectionAttempts++;
    console.log(`[RPC] Initialisation du RPC Discord (tentative ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
    
    // Vérifier si Discord est ouvert (mais essayer quand même)
    const discordDetected = isDiscordRunning();
    console.log(`[RPC] Discord détecté: ${discordDetected}`);
    
    if (!discordDetected) {
      console.log('[RPC] Discord non détecté, tentative de connexion quand même...');
    }
    
    // Essayer chaque ID jusqu'à ce qu'un fonctionne
    for (let i = 0; i < FALLBACK_DISCORD_IDS.length; i++) {
      const clientId = FALLBACK_DISCORD_IDS[i];
      const connected = await connectWithClientId(clientId, i + 1);
      
      if (connected) {
        console.log(`[RPC] Connexion réussie avec l'ID ${clientId}`);
        return true;
      }
      
      // Nettoyer le client si la connexion a échoué
      if (rpcClient) {
        try {
          await rpcClient.destroy();
        } catch {}
        rpcClient = null;
      }
      
      // Pause entre les tentatives
      if (i < FALLBACK_DISCORD_IDS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('[RPC] Tous les IDs ont échoué, RPC désactivé');
    isConnected = false;
    return false;
    
  } catch (error) {
    console.error('[RPC] Erreur lors de l\'initialisation du RPC:', error.message);
    isConnected = false;
    return false;
  }
}

// Vérifier si Discord est ouvert
function isDiscordRunning() {
  try {
    const { execSync } = require('child_process');
    const platform = process.platform;
    
    if (platform === 'win32') {
      try {
        // Méthode 1: tasklist (cherche toutes les variantes de Discord)
        const result1 = execSync('tasklist | findstr /i "discord"', { encoding: 'utf8', stdio: 'pipe' });
        if (result1.toLowerCase().includes('discord')) return true;
      } catch {}
      
      try {
        // Méthode 2: wmic (plus fiable)
        const result2 = execSync('wmic process where "name like \'%discord%\'" get name', { encoding: 'utf8', stdio: 'pipe' });
        if (result2.includes('Discord')) return true;
      } catch {}
      
      try {
        // Méthode 3: powershell
        const result3 = execSync('powershell "Get-Process | Where-Object {$_.ProcessName -like \'*discord*\'}"', { encoding: 'utf8', stdio: 'pipe' });
        if (result3.includes('Discord')) return true;
      } catch {}
      
      return false;
    } else if (platform === 'darwin') {
      try {
        const result = execSync('ps aux | grep -i "discord" | grep -v grep', { encoding: 'utf8', stdio: 'pipe' });
        return result.includes('Discord');
      } catch {
        return false;
      }
    } else {
      try {
        const result = execSync('ps aux | grep -i "discord" | grep -v grep', { encoding: 'utf8', stdio: 'pipe' });
        return result.includes('discord');
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

// Mettre à jour la présence Discord
function updatePresence(state, details = null, serverName = null) {
  if (!isConnected || !rpcClient) {
    console.log('[RPC] Client non connecté, mise à jour ignorée');
    return;
  }
  
  try {
    const presence = {
      state: state || 'Dans le launcher',
      details: details || 'Eminium Launcher',
      startTimestamp: DISCORD_START_TIME,
      largeImageKey: 'eminium_logo', // Nom de l'image uploadée sur Discord
      largeImageText: 'Eminium Launcher',
      smallImageKey: 'eminium_icon', // Icône plus petite
      smallImageText: 'Eminium Network',
      instance: false
    };
    
    // Ajouter les informations du serveur si disponibles
    if (serverName) {
      presence.details = `Serveur: ${serverName}`;
    }
    
    // Définir les boutons d'action
    presence.buttons = [
      {
        label: 'Télécharger le Launcher',
        url: 'https://eminium.ovh'
      },
      {
        label: 'Rejoindre le Discord',
        url: 'https://discord.gg/eminium' // Remplace par ton lien Discord
      }
    ];
    
    rpcClient.setActivity(presence);
    console.log(`[RPC] Présence mise à jour: ${state} - ${details || 'Eminium Launcher'}`);
    
  } catch (error) {
    console.error('[RPC] Erreur lors de la mise à jour de la présence:', error);
  }
}

// États prédéfinis
const PRESENCE_STATES = {
  IDLE: {
    state: 'Dans le launcher',
    details: 'Eminium Launcher',
    smallImageKey: 'idle'
  },
  DOWNLOADING: {
    state: 'Téléchargement...',
    details: 'Ressources en cours de téléchargement',
    smallImageKey: 'downloading'
  },
  LAUNCHING: {
    state: 'Lancement...',
    details: 'Préparation du jeu',
    smallImageKey: 'launching'
  },
  PLAYING_MINI_GAMES: {
    state: 'En jeu - Mini-Jeux',
    details: 'Serveur: Eminium Mini-Jeux',
    smallImageKey: 'playing'
  },
  PLAYING_FACTIONS: {
    state: 'En jeu - Factions',
    details: 'Serveur: Eminium Factions',
    smallImageKey: 'playing'
  },
  CONNECTING: {
    state: 'Connexion au serveur...',
    details: 'Connexion en cours',
    smallImageKey: 'connecting'
  }
};

// Fonctions pratiques pour chaque état
function setPresenceIdle() {
  updatePresence(PRESENCE_STATES.IDLE.state, PRESENCE_STATES.IDLE.details);
}

function setPresenceDownloading() {
  updatePresence(PRESENCE_STATES.DOWNLOADING.state, PRESENCE_STATES.DOWNLOADING.details);
}

function setPresenceLaunching() {
  updatePresence(PRESENCE_STATES.LAUNCHING.state, PRESENCE_STATES.LAUNCHING.details);
}

function setPresencePlaying(serverName) {
  // Messages plus visibles avec emojis pour Discord
  if (serverName.includes('Mini-Jeux')) {
    updatePresence('🎮 En jeu - Mini-Jeux', 'Serveur: Eminium Mini-Jeux', serverName);
  } else if (serverName.includes('Factions')) {
    updatePresence('⚔️ En jeu - Factions', 'Serveur: Eminium Factions', serverName);
  } else if (serverName.includes('Créatif')) {
    updatePresence('🏗️ En jeu - Créatif', 'Serveur: Eminium Créatif', serverName);
  } else {
    updatePresence('🎮 En jeu', `Serveur: ${serverName}`, serverName);
  }
  console.log(`[RPC] En jeu détecté: ${serverName}`);
}

function setPresenceConnecting(serverName) {
  updatePresence(PRESENCE_STATES.CONNECTING.state, `Connexion à ${serverName}`, serverName);
}

// Déconnexion propre du RPC
async function disconnectDiscordRPC() {
  if (rpcClient && isConnected) {
    try {
      await rpcClient.destroy();
      rpcClient = null;
      isConnected = false;
    } catch (error) {
      console.error('[RPC] Erreur lors de la déconnexion:', error);
    }
    console.log('[RPC] RPC Discord déconnecté avec succès');
  }
}

// Exporter les fonctions
module.exports = {
  initializeDiscordRPC,
  updatePresence,
  disconnectDiscordRPC,
  setPresenceIdle,
  setPresenceDownloading,
  setPresenceLaunching,
  setPresencePlaying,
  setPresenceConnecting,
  PRESENCE_STATES,
  isConnected: () => isConnected
};
