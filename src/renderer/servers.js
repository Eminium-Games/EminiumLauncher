// servers.js - Gestion des serveurs pour Eminium Launcher

class ServerManager {
  constructor() {
    this.servers = [];
    this.currentServer = null;
    this.serverElements = new Map();
    this.initElements();
    this.setupEventListeners();
    this.loadServers();
  }

  // Initialisation des éléments du DOM
  initElements() {
    this.elements = {
      serversList: document.getElementById('serversList'),
      serverControlPanel: document.getElementById('serverControlPanel'),
      btnBackToServers: document.getElementById('btnBackToServers'),
      serverStatus: document.getElementById('serverStatus'),
      onlinePlayers: document.getElementById('onlinePlayers'),
      maxPlayers: document.getElementById('maxPlayers'),
      playerList: document.getElementById('playerList'),
      serverVersion: document.getElementById('serverVersion'),
      protocolVersion: document.getElementById('protocolVersion'),
      serverPing: document.getElementById('serverPing'),
      lastPing: document.getElementById('lastPing'),
      btnPlay: document.getElementById('btnPlay'),
      btnCheck: document.getElementById('btnCheck'),
      btnForceUpdate: document.getElementById('btnForceUpdate')
    };
  }

  // Configuration des écouteurs d'événements
  setupEventListeners() {
    // Retour à la liste des serveurs
    this.elements.btnBackToServers.addEventListener('click', () => this.showServerList());

    // Bouton de jeu
    this.elements.btnPlay.addEventListener('click', () => this.connectToServer());

    // Vérification des mises à jour
    this.elements.btnCheck.addEventListener('click', () => this.checkForUpdates());
    this.elements.btnForceUpdate.addEventListener('click', () => this.forceUpdate());

    // Gestion des clics sur les serveurs
    document.addEventListener('click', (e) => {
      const serverCard = e.target.closest('.server-card');
      if (!serverCard) return;

      const action = e.target.closest('[data-action]')?.dataset.action;
      const serverId = serverCard.dataset.serverId;

      if (action === 'connect') {
        this.selectServer(serverId);
      } else if (action === 'info') {
        this.showServerInfo(serverId);
      } else {
        this.selectServer(serverId);
      }
    });
  }

  // Chargement des serveurs
  async loadServers() {
    try {
      // Chargement des serveurs depuis l'API ou le cache
      const response = await window.eminium.getServers();
      this.servers = response.servers || [];

      // Si aucun serveur n'est disponible, charger des exemples
      if (this.servers.length === 0) {
        console.warn('Aucun serveur chargé, utilisation des serveurs par défaut');
        this.servers = [
          {
            id: 'survival',
            name: 'Serveur Survival Moddé',
            description: 'Survie classique avec mods et économie.',
            icon: 'https://minotar.net/helm/MHF_Creeper/64.png',
            status: 'online',
            players: { online: 24, max: 100, list: ['Joueur1', 'Joueur2'] },
            version: '1.20.1',
            protocol: 763,
            ping: 45,
            lastPing: new Date(),
            address: 'play.eminium.ovh:25565',
            features: ['economy', 'jobs', 'events'],
            modded: true,
            modpack: {
              name: 'EminiumPack',
              version: '1.2.0',
              required: true,
              downloadUrl: 'https://example.com/mods/eminiumpack.zip'
            },
            javaArgs: '-Xmx4G -Xms2G -XX:+UseG1GC',
            supportedLaunchers: ['forge', 'fabric']
          },
          {
            id: 'vanilla',
            name: 'Serveur Vanilla',
            description: 'Minecraft vanilla sans mods, version récente.',
            icon: 'https://minotar.net/helm/Steve/64.png',
            status: 'online',
            players: { online: 15, max: 50, list: ['Joueur3', 'Joueur4'] },
            version: '1.20.4',
            protocol: 765,
            ping: 32,
            lastPing: new Date(),
            address: 'vanilla.eminium.ovh:25566',
            features: ['vanilla'],
            modded: false,
            javaArgs: '-Xmx2G -Xms1G',
            supportedLaunchers: ['vanilla']
          },
          {
            id: 'minigames',
            name: 'Mini-jeux',
            description: 'Collection de mini-jeux variés : SkyWars, BedWars, PvP et bien plus encore !',
            icon: 'https://minotar.net/helm/MHF_Cake/64.png',
            status: 'maintenance',
            players: { online: 0, max: 0, list: [] },
            version: '1.19.4',
            protocol: 762,
            ping: 0,
            lastPing: new Date(),
            address: 'games.eminium.ovh:25567',
            features: ['skywars', 'bedwars', 'pvp'],
            modded: true,
            modpack: {
              name: 'MinigamePack',
              version: '2.1.3',
              required: true,
              downloadUrl: 'https://example.com/mods/minigamepack.zip'
            },
            javaArgs: '-Xmx3G -Xms2G -XX:+UseG1GC',
            supportedLaunchers: ['forge']
          }
        ];
      }

      this.renderServers();
      this.startPingInterval();
    } catch (error) {
      console.error('Erreur lors du chargement des serveurs:', error);
    }
  }

  // Affichage de la liste des serveurs
  renderServers() {
    this.elements.serversList.innerHTML = '';

    this.servers.forEach(server => {
      const serverElement = this.createServerElement(server);
      this.serverElements.set(server.id, serverElement);
      this.elements.serversList.appendChild(serverElement);
    });
  }

  // Création d'un élément serveur
  createServerElement(server) {
    const serverElement = document.createElement('div');
    serverElement.className = `server-card ${server.status === 'offline' ? 'disabled' : ''} ${server.modded ? 'modded' : 'vanilla'}`;
    serverElement.dataset.serverId = server.id;

    const playerCount = server.players?.online || 0;
    const maxPlayers = server.players?.max || 0;
    const statusClass = server.status === 'online' ? 'online' : server.status === 'offline' ? 'offline' : 'maintenance';
    const statusText = server.status === 'online' ? `En ligne: ${playerCount}/${maxPlayers}` : 
                      server.status === 'maintenance' ? 'Maintenance' : 'Hors ligne';

    // Badges pour les fonctionnalités spéciales
    const badges = [];
    if (server.modded) {
      badges.push('<span class="badge badge-modded">Moddé</span>');
    }
    if (server.features?.includes('vanilla')) {
      badges.push('<span class="badge badge-vanilla">Vanilla</span>');
    }

    serverElement.innerHTML = `
      <div class="server-header">
        <div class="server-icon">
          <img src="${server.icon}" alt="${server.name}">
        </div>
        <div class="server-info">
          <div class="server-title">
            <h4 class="server-name">${server.name}</h4>
            ${badges.join(' ')}
          </div>
          <div class="server-meta">
            <span class="server-version">${server.version}</span>
            <span class="server-status ${statusClass}">
              <span class="status-indicator"></span>
              ${statusText}
            </span>
          </div>
        </div>
      </div>
      <p class="server-desc">${server.description}</p>
      <div class="server-stats">
        <div class="server-stat">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>${playerCount} joueur${playerCount > 1 ? 's' : ''} en ligne</span>
        </div>
        <div class="server-stat">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Ping: ${server.ping}ms</span>
        </div>
      </div>
      <div class="server-actions">
        <button class="btn ${server.status === 'online' ? 'btn-primary' : 'btn-secondary'} btn-sm" 
                data-action="connect" 
                ${server.status !== 'online' ? 'disabled' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          ${server.status === 'online' ? 'Se connecter' : 'Indisponible'}
        </button>
        <button class="btn btn-secondary btn-sm" data-action="info">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          Détails
        </button>
      </div>
    `;

    return serverElement;
  }

  // Sélection d'un serveur
  selectServer(serverId) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) return;

    this.currentServer = server;
    this.showServerPanel(server);
  }

  // Affichage du panneau du serveur
  showServerPanel(server) {
    // Mise à jour des informations du serveur
    this.elements.serverStatus.textContent = this.getStatusText(server.status);
    this.elements.serverStatus.className = `server-status ${server.status}`;
    this.elements.onlinePlayers.textContent = server.players?.online || 0;
    this.elements.maxPlayers.textContent = server.players?.max || 0;
    this.elements.playerList.textContent = server.players?.list?.join(', ') || 'Aucun joueur';
    this.elements.serverVersion.textContent = server.version;
    this.elements.protocolVersion.textContent = server.protocol || 'Inconnu';
    this.elements.serverPing.textContent = server.ping || '0';
    this.elements.lastPing.textContent = this.formatDate(server.lastPing);

    // Affichage du panneau
    document.getElementById('serversList').style.display = 'none';
    this.elements.serverControlPanel.style.display = 'block';
  }

  // Retour à la liste des serveurs
  showServerList() {
    document.getElementById('serversList').style.display = 'grid';
    this.elements.serverControlPanel.style.display = 'none';
    this.currentServer = null;
  }

  // Lancement de Minecraft avec les paramètres du serveur
  async launchMinecraft(server) {
    try {
      this.showNotification('Préparation', `Préparation du lancement de ${server.name}...`, 'info');
      
      const launchOptions = {
        version: server.version,
        serverAddress: server.address.split(':')[0],
        serverPort: server.address.split(':')[1] || '25565',
        javaPath: 'java',
        javaArgs: server.javaArgs || '-Xmx2G -Xms1G',
        launcherName: 'EminiumLauncher',
        modded: server.modded || false
      };

      // Si le serveur nécessite un modpack
      if (server.modded && server.modpack) {
        launchOptions.modpack = {
          name: server.modpack.name,
          version: server.modpack.version,
          required: server.modpack.required,
          url: server.modpack.downloadUrl
        };
        
        // Vérifier si le modpack est déjà installé
        const modpackInstalled = await window.eminium.checkModpack(server.modpack.name, server.modpack.version);
        
        if (!modpackInstalled) {
          this.showNotification('Téléchargement', `Téléchargement du modpack ${server.modpack.name}...`, 'info');
          await window.eminium.downloadModpack(
            server.modpack.downloadUrl, 
            server.modpack.name, 
            server.modpack.version
          );
        }
      }

      // Lancer le jeu
      const result = await window.eminium.launchGame(launchOptions);
      
      if (result.success) {
        this.showNotification('Lancement', 'Minecraft est en cours de démarrage...', 'success');
      } else {
        throw new Error(result.error || 'Erreur inconnue lors du lancement');
      }
    } catch (error) {
      console.error('Erreur lors du lancement:', error);
      this.showNotification('Erreur', `Impossible de lancer le jeu: ${error.message}`, 'error');
    }
  }

  // Connexion au serveur
  async connectToServer() {
    if (!this.currentServer) return;

    try {
      this.elements.btnPlay.disabled = true;
      this.elements.btnPlay.innerHTML = '<span class="loading-spinner"></span> Préparation...';
      
      await this.launchMinecraft(this.currentServer);
      
    } catch (error) {
      console.error('Erreur lors de la connexion au serveur:', error);
      this.showNotification('Erreur', 'Impossible de se connecter au serveur', 'error');
    } finally {
      this.elements.btnPlay.disabled = false;
      this.elements.btnPlay.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Jouer
      `;
    }
  }

  // Vérification des mises à jour
  async checkForUpdates() {
    try {
      this.elements.btnCheck.disabled = true;
      this.elements.btnCheck.innerHTML = '<span class="loading-spinner"></span> Vérification...';
      
      // Simuler une vérification de mise à jour
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Ici, vous pourriez vérifier les mises à jour disponibles
      const hasUpdates = Math.random() > 0.5;
      
      if (hasUpdates) {
        this.showNotification('Mises à jour disponibles', 'Téléchargement des mises à jour...', 'info');
        // Simuler un téléchargement
        await new Promise(resolve => setTimeout(resolve, 2000));
        this.showNotification('Mise à jour terminée', 'Le jeu est à jour !', 'success');
      } else {
        this.showNotification('À jour', 'Votre jeu est à jour', 'success');
      }
      
    } catch (error) {
      console.error('Erreur lors de la vérification des mises à jour:', error);
      this.showNotification('Erreur', 'Impossible de vérifier les mises à jour', 'error');
    } finally {
      this.elements.btnCheck.disabled = false;
      this.elements.btnCheck.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Vérifier les mises à jour
      `;
    }
  }

  // Forcer la mise à jour
  async forceUpdate() {
    try {
      this.elements.btnForceUpdate.disabled = true;
      this.elements.btnForceUpdate.innerHTML = '<span class="loading-spinner"></span> Téléchargement...';
      
      this.showNotification('Téléchargement', 'Téléchargement des fichiers...', 'info');
      
      // Simuler un téléchargement forcé
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.showNotification('Mise à jour terminée', 'Tous les fichiers ont été mis à jour', 'success');
      
    } catch (error) {
      console.error('Erreur lors de la mise à jour forcée:', error);
      this.showNotification('Erreur', 'Impossible de forcer la mise à jour', 'error');
    } finally {
      this.elements.btnForceUpdate.disabled = false;
      this.elements.btnForceUpdate.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 16h5v5"></path>
        </svg>
        Forcer la mise à jour
      `;
    }
  }

  // Affichage des informations détaillées d'un serveur
  showServerInfo(serverId) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) return;

    // Ici, vous pourriez afficher une boîte de dialogue ou un panneau avec les informations détaillées du serveur
    const message = `
      <h3>${server.name}</h3>
      <p><strong>Statut:</strong> ${this.getStatusText(server.status)}</p>
      <p><strong>Joueurs en ligne:</strong> ${server.players?.online || 0}/${server.players?.max || 0}</p>
      <p><strong>Version:</strong> ${server.version} (Protocole: ${server.protocol || 'Inconnu'})</p>
      <p><strong>Adresse:</strong> ${server.address}</p>
      <p><strong>Ping:</strong> ${server.ping || '0'} ms</p>
      <p><strong>Dernière mise à jour:</strong> ${this.formatDate(server.lastPing)}</p>
      <p><strong>Fonctionnalités:</strong> ${server.features?.join(', ') || 'Aucune'}</p>
    `;

    this.showNotification(server.name, message, 'info', 10000);
  }

  // Ping régulier des serveurs pour mettre à jour leur statut
  startPingInterval() {
    // Ping initial
    this.pingAllServers();

    // Mettre à jour toutes les 30 secondes
    setInterval(() => this.pingAllServers(), 30000);
  }

  // Ping de tous les serveurs
  async pingAllServers() {
    for (const server of this.servers) {
      try {
        // Simuler un ping avec un délai aléatoire
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        
        // Mise à jour aléatoire du statut pour la démo
        if (Math.random() > 0.1) { // 90% de chance que le serveur réponde
          const newPing = Math.floor(10 + Math.random() * 100);
          server.ping = newPing;
          server.status = 'online';
          server.lastPing = new Date();
          
          // Mise à jour aléatoire du nombre de joueurs
          if (Math.random() > 0.7) { // 30% de chance de changer le nombre de joueurs
            const change = Math.floor(Math.random() * 3) - 1; // -1, 0 ou 1
            server.players.online = Math.max(0, Math.min(server.players.max, server.players.online + change));
          }
        } else {
          server.status = 'offline';
          server.ping = 0;
        }
        
        // Mise à jour de l'interface utilisateur
        this.updateServerUI(server);
      } catch (error) {
        console.error(`Erreur lors du ping du serveur ${server.name}:`, error);
        server.status = 'offline';
        server.ping = 0;
        this.updateServerUI(server);
      }
    }
  }

  // Mise à jour de l'interface utilisateur pour un serveur
  updateServerUI(server) {
    const serverElement = this.serverElements.get(server.id);
    if (!serverElement) return;

    // Mise à jour du statut
    const statusElement = serverElement.querySelector('.server-status');
    if (statusElement) {
      statusElement.className = `server-status ${server.status}`;
      statusElement.innerHTML = `
        <span class="status-indicator"></span>
        ${server.status === 'online' ? `En ligne: ${server.players?.online || 0}/${server.players?.max || 0}` : 
          server.status === 'maintenance' ? 'Maintenance' : 'Hors ligne'}
      `;
    }

    // Mise à jour du ping
    const pingElement = serverElement.querySelector('.server-stat:last-child span:last-child');
    if (pingElement) {
      pingElement.textContent = `Ping: ${server.ping || '0'}ms`;
    }

    // Mise à jour du nombre de joueurs
    const playersElement = serverElement.querySelector('.server-stat:first-child span:last-child');
    if (playersElement) {
      playersElement.textContent = `${server.players?.online || 0} joueur${server.players?.online !== 1 ? 's' : ''} en ligne`;
    }

    // Mise à jour du bouton de connexion
    const connectButton = serverElement.querySelector('[data-action="connect"]');
    if (connectButton) {
      connectButton.disabled = server.status !== 'online';
      connectButton.className = `btn ${server.status === 'online' ? 'btn-primary' : 'btn-secondary'} btn-sm`;
      connectButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        ${server.status === 'online' ? 'Se connecter' : 'Indisponible'}
      `;
    }

    // Si ce serveur est actuellement sélectionné, mettre à jour le panneau de contrôle
    if (this.currentServer && this.currentServer.id === server.id) {
      this.showServerPanel(server);
    }
  }

  // Affichage d'une notification
  showNotification(title, message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ⓘ'
    }[type] || 'ⓘ';

    notification.innerHTML = `
      <div class="notification-icon">${icon}</div>
      <div class="notification-content">
        <h4 class="notification-title">${title}</h4>
        <p class="notification-message">${message}</p>
      </div>
      <button class="notification-close" aria-label="Fermer">×</button>
    `;

    document.body.appendChild(notification);
    
    // Animation d'entrée
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Fermeture au clic sur le bouton
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
    
    // Fermeture automatique
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) {
          notification.classList.remove('show');
          setTimeout(() => notification.remove(), 300);
        }
      }, duration);
    }
  }

  // Formatage de la date
  formatDate(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Obtention du texte du statut
  getStatusText(status) {
    return {
      online: 'En ligne',
      offline: 'Hors ligne',
      maintenance: 'Maintenance'
    }[status] || status;
  }
}

// Initialisation du gestionnaire de serveurs lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
  window.serverManager = new ServerManager();
  
  // Configuration des sliders
  const memSlider = document.getElementById('memSlider');
  const memLabel = document.getElementById('memLabel');
  const memProgress = document.getElementById('memProgress');
  
  if (memSlider && memLabel && memProgress) {
    const updateMemDisplay = () => {
      const value = parseInt(memSlider.value);
      memLabel.textContent = `${value} Mo`;
      
      // Mise à jour de la barre de progression
      const min = parseInt(memSlider.min);
      const max = parseInt(memSlider.max);
      const percent = ((value - min) / (max - min)) * 100;
      memProgress.style.width = `${percent}%`;
    };
    
    memSlider.addEventListener('input', updateMemDisplay);
    updateMemDisplay();
  }
  
  // Configuration du slider de distance de rendu
  const renderDist = document.getElementById('renderDist');
  const renderLabel = document.getElementById('renderLabel');
  
  if (renderDist && renderLabel) {
    renderDist.addEventListener('input', () => {
      renderLabel.textContent = `${renderDist.value} chunks`;
    });
  }
  
  // Configuration du slider de FPS
  const fpsCap = document.getElementById('fpsCap');
  const fpsLabel = document.getElementById('fpsLabel');
  
  if (fpsCap && fpsLabel) {
    fpsCap.addEventListener('input', () => {
      fpsLabel.textContent = fpsCap.value;
    });
  }
  
  // Détection de la RAM système
  if (window.eminium?.getSystemRamMB) {
    window.eminium.getSystemRamMB().then(info => {
      if (info?.ok && info.totalMB) {
        const ramInfo = document.getElementById('ramInfo');
        if (ramInfo) {
          const recommended = Math.min(8192, Math.max(2048, Math.floor(info.totalMB * 0.6)));
          ramInfo.textContent = `Système: ${Math.round(info.totalMB / 1024)} Go | Recommandé: ${Math.round(recommended / 1024)} Go`;
          
          // Définir la valeur recommandée
          if (memSlider) {
            memSlider.value = recommended;
            memSlider.dispatchEvent(new Event('input'));
          }
        }
      }
    }).catch(console.error);
  }
});