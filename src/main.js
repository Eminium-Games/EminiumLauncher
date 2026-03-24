// Load .env early
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch { }
const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const AdmZip = require('adm-zip');
let DiscordRPC;
try { DiscordRPC = require('discord-rpc'); } catch { }
const axios = require('axios');
const net = require('net');
const { ensureAll, launchMinecraft, readUserProfile, logoutEminium, checkReady, prepareGame } = require('./setup');
const discordRPC = require('./discord');

let mainWindow;
let windowIcon; // nativeImage pour l'icône
let rpcClient = null;
let rpcReady = false;
// When true, app stays alive in background even if all windows are closed (used when closing on play)
let keepAliveBackground = false;
let isGameRunning = false;
// Shared Discord Application ID for all users. Replace the placeholder with your real Client ID.
const DISCORD_APP_ID_SHARED = process.env.DISCORD_APP_ID_SHARED || '1400888551486521454';

// Configuration de base

function getAzuriomAuthHeaders() {
  const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  try {
    // Priority 1: explicit API token from env (server token)
    const t = process.env.AZ_API_TOKEN || process.env.AZURIOM_API_TOKEN;
    if (t) { headers.Authorization = `Bearer ${t}`; return headers; }
  } catch { }
  try {
    // Priority 2: token from logged-in user profile (best effort)
    const prof = readUserProfile && readUserProfile();
    const userToken = prof?.token || prof?.accessToken || prof?.apiToken || prof?.authToken;
    if (userToken) headers.Authorization = `Bearer ${userToken}`;
  } catch { }
  return headers;
}

// Fonctionnalité de maintenance désactivée
// Définit un fallback global au cas où d'anciens appels y feraient encore référence
const remoteMaintenance = false;

// --- Discord Rich Presence helpers ---
async function initDiscordRPC() {
  try {
    await discordRPC.initializeDiscordRPC();
    return true;
  } catch (error) {
    console.error('[RPC] Erreur d\'initialisation:', error);
    return false;
  }
}

function clearPresence() {
  try {
    if (discordRPC.isConnected()) {
      discordRPC.updatePresence('', '', '');
    }
  } catch (error) {
    console.error('[RPC] Erreur lors du clear presence:', error);
  }
}

function destroyDiscordRPC() {
  try {
    discordRPC.disconnectDiscordRPC();
  } catch (error) {
    console.error('[RPC] Erreur lors de la déconnexion:', error);
  }
}

function setPresenceIdle() {
  try {
    discordRPC.setPresenceIdle();
  } catch (error) {
    console.error('[RPC] Erreur setPresenceIdle:', error);
  }
}

function setPresencePreparing() {
  try {
    discordRPC.setPresenceDownloading();
  } catch (error) {
    console.error('[RPC] Erreur setPresencePreparing:', error);
  }
}

function setPresencePlaying(serverName = 'Eminium') {
  try {
    discordRPC.setPresencePlaying(serverName);
  } catch (error) {
    console.error('[RPC] Erreur setPresencePlaying:', error);
  }
}

function setPresenceLaunching() {
  try {
    discordRPC.setPresenceLaunching();
  } catch (error) {
    console.error('[RPC] Erreur setPresenceLaunching:', error);
  }
}

function setPresenceConnecting(serverName) {
  try {
    discordRPC.setPresenceConnecting(serverName);
  } catch (error) {
    console.error('[RPC] Erreur setPresenceConnecting:', error);
  }
}

const { loginEminium } = require('./setup.js');

// Enregistrer tous les handlers IPC avant app.whenReady()
ipcMain.handle('auth:login', async (_evt, { email, password, code }) => {
  return await loginEminium(email, password, code);
});

// Gestion des préférences Java
ipcMain.handle('saveSetting', async (_evt, { key, value }) => {
  try {
    const settings = readSettings();
    settings[key] = value;
    writeSettings(settings);
    return { ok: true };
  } catch (e) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('loadSetting', async (_evt, key) => {
  try {
    const settings = readSettings();
    return settings[key] || null;
  } catch (e) { return null; }
});

// Boîte de dialogue pour sélectionner un fichier
ipcMain.handle('showOpenDialog', async (_evt, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (e) { 
    return { canceled: true, filePaths: [] }; 
  }
});

// (payments notifications removed)

const REPO_OWNER = 'Eminium-Games';
const REPO_NAME = 'EminiumLauncher';
const REPO_BRANCH = 'main';
const APP_VERSION = (() => {
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return String(pkg.version || '0.0.0');
  } catch { return '0.0.0'; }
})();

function getGithubHeaders(extra = {}) {
  const base = { 'Accept': 'application/vnd.github+json', 'User-Agent': `EminiumLauncher/${APP_VERSION}` };
  const headers = Object.assign({}, base, extra || {});
  try { if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`; } catch { }
  return headers;
}

function isGithubRateLimited(error) {
  try {
    const status = error?.response?.status;
    if (status === 429) return true;
    if (status === 403) {
      const msg = String(error?.response?.data?.message || error?.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('abuse detection')) return true;
      const rem = error?.response?.headers?.['x-ratelimit-remaining'];
      if (rem === '0') return true;
    }
  } catch {}
  return false;
}

function getIconPath() {
  // Utiliser l'icône locale par défaut pour l'instant
  // L'icône web nécessite une gestion asynchrone plus complexe
  const devPath = path.join(__dirname, '..', 'assets', 'icon', 'icon.ico');
  const prodPath = path.join(process.resourcesPath || '', 'assets', 'icon', 'icon.ico');
  return fs.existsSync(devPath) ? devPath : prodPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Eminium Launcher',
    resizable: true,
    backgroundColor: '#0b0f1a',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Improve readability on standard displays
  try { mainWindow.webContents.setZoomFactor(1.1); } catch { }

  // Relayer les événements de progression émis côté setup.js (globalThis.emitPlayProgress)
  global.emitPlayProgress = (data) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play:progress', data);
      }
    } catch { }
  };

  // Cleanup on window closed
  mainWindow.on('closed', () => {
    try { global.emitPlayProgress = () => { }; } catch { }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();
  // Init Discord RPC if configured (non-blocking)
  setTimeout(async () => {
    try {
      const rpcInitialized = await initDiscordRPC();
      if (!rpcInitialized) {
        console.log('[RPC] RPC Discord non initialisé (Discord fermé ou non disponible)');
      }
    } catch (error) {
      console.log('[RPC] RPC Discord désactivé (erreur non critique)');
    }
  }, 2000); // Démarrer après 2 secondes pour ne pas bloquer le lancement
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Désactivation des fonctionnalités de maintenance

  // Auto-check on startup: if remote version differs, force reinstall
  try {
    if (String(process.env.DISABLE_AUTO_UPDATE || '').toLowerCase() === 'true' || process.env.DISABLE_AUTO_UPDATE === '1') {
      // Skip auto update check if disabled
    } else {
      const headers = getGithubHeaders();
      // Read remote package.json via Contents API (honors Authorization)
      const pkgApi = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/package.json?ref=${REPO_BRANCH}`;
      const pkgRes = await axios.get(pkgApi, { timeout: 15000, headers });
      let remoteVersion = '';
      try {
        const content = pkgRes?.data?.content; // base64
        if (content) {
          const json = JSON.parse(Buffer.from(String(content), 'base64').toString('utf8'));
          if (json && typeof json.version === 'string') remoteVersion = json.version.trim();
        }
      } catch { }
      if (remoteVersion && remoteVersion !== APP_VERSION) {
        // Fetch latest commit sha for tag and asset URL
        const commitApi = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;
        const cres = await axios.get(commitApi, { timeout: 15000, headers });
        const sha = String(cres?.data?.sha || '').trim();
        const tag = sha || `v-${Date.now()}`;
        const assetUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/zip/refs/heads/${REPO_BRANCH}`;
        // Reuse download/apply flows to show progress in renderer if open
        const dlHeaders = getGithubHeaders({});
        const updatesBase = path.join(app.getPath('userData'), 'updates', tag.replace(/[^a-zA-Z0-9._-]/g, '_'));
        try { fs.mkdirSync(updatesBase, { recursive: true }); } catch { }
        const destZip = path.join(updatesBase, 'launcher.zip');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:progress', { phase: 'start', currentFile: 0, totalFiles: 1, label: 'Préparation du téléchargement' });
        }
        const resp = await axios.get(assetUrl, { responseType: 'stream', timeout: 60000, maxContentLength: Infinity, maxBodyLength: Infinity, headers: dlHeaders });
        const total = Number(resp.headers['content-length'] || 0);
        let downloaded = 0;
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(destZip);
          resp.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (mainWindow && !mainWindow.isDestroyed()) {
              const percent = total ? Math.round((downloaded / total) * 100) : Math.min(99, Math.round(downloaded / (1024 * 1024)));
              mainWindow.webContents.send('update:progress', { phase: 'downloading', currentFile: 1, totalFiles: 1, percent });
            }
          });
          resp.data.on('error', reject);
          ws.on('error', reject);
          ws.on('finish', resolve);
          resp.data.pipe(ws);
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:progress', { phase: 'downloaded', message: 'Téléchargement terminé.' });
        }
        // Apply
        const zip = new AdmZip(destZip);
        const staging = path.join(updatesBase, 'staging');
        try { fs.rmSync(staging, { recursive: true, force: true }); } catch { }
        fs.mkdirSync(staging, { recursive: true });
        zip.extractAllTo(staging, true);
        const entryNames = fs.readdirSync(staging, { withFileTypes: true });
        const rootName = entryNames.find(e => e.isDirectory())?.name;
        const root = rootName ? path.join(staging, rootName) : staging;
        const appDir = path.join(__dirname, '..');
        const copyList = ['assets', 'src', 'package.json', 'package-lock.json', 'node_modules'];
        const ensureDir = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch { } };
        const listFiles = (dir) => {
          let n = 0; const st = fs.statSync(dir);
          if (st.isFile()) return 1;
          for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            const s = fs.statSync(p);
            n += s.isDirectory() ? listFiles(p) : 1;
          }
          return n;
        };
        let totalFiles = 0;
        for (const item of copyList) {
          const p = path.join(root, item);
          if (fs.existsSync(p)) totalFiles += listFiles(p);
        }
        let currentFile = 0;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:progress', { phase: 'applying', currentFile, totalFiles, label: 'Application de la mise à jour' });
        }
        const applyOne = (src, dst) => {
          const st = fs.statSync(src);
          if (st.isDirectory()) {
            ensureDir(dst);
            for (const name of fs.readdirSync(src)) applyOne(path.join(src, name), path.join(dst, name));
          } else if (st.isFile()) {
            ensureDir(path.dirname(dst));
            fs.copyFileSync(src, dst);
            currentFile++;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update:progress', { phase: 'applying', currentFile, totalFiles });
            }
          }
        };
        for (const item of copyList) {
          const srcPath = path.join(root, item);
          if (fs.existsSync(srcPath)) applyOne(srcPath, path.join(appDir, item));
        }
        const storeDir = path.join(app.getPath('userData'), 'updates');
        try { fs.mkdirSync(storeDir, { recursive: true }); } catch { }
        const lastFile = path.join(storeDir, 'last_sha.txt');
        try { fs.writeFileSync(lastFile, tag); } catch { }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:progress', { phase: 'done', message: 'Mise à jour appliquée. Redémarrage...' });
        }
        // Relaunch
        app.relaunch();
        app.quit();
      }
    }
  } catch (e) {
    // Silencieux: on n'empêche pas l'app de démarrer
    if (isGithubRateLimited(e)) {
      // quietly skip on rate limit
    }
  }
});

// (shop IPC handlers removed)

app.on('window-all-closed', () => {
  // Do not quit if we intentionally keep the app alive while the game is running
  if (keepAliveBackground) return;
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  try { clearPresence(); } catch { }
  try { destroyDiscordRPC(); } catch { }
  try { global.emitPlayProgress = () => { }; } catch { }
});

// Settings storage (JSON under userData)
function getSettingsPath() {
  const dir = path.join(app.getPath('userData'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { }
  return path.join(dir, 'settings.json');
}
function readSettings() {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch { return {}; }
}
function writeSettings(patch) {
  const current = readSettings();
  const next = Object.assign({}, current, (patch && typeof patch === 'object') ? patch : {});
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
    return { ok: true, settings: next };
  } catch (e) { return { ok: false, error: e?.message || String(e) }; }
}

// Helper: detect if saved profile represents an admin
function isAdminProfile(p) {
  try {
    if (!p) return false;
    const parts = [];
    if (typeof p.role === 'string') parts.push(p.role);
    if (typeof p.grade === 'string') parts.push(p.grade);
    if (p.role && typeof p.role === 'object' && p.role.name) parts.push(p.role.name);
    if (p.grade && typeof p.grade === 'object' && p.grade.name) parts.push(p.grade.name);
    const s = parts.join(' ').toLowerCase();
    return /\b(administrateur|développeur|super-modérateur|modérateur|responsable|modérateur test|animateur|commandant|seigneur|recrue|premium|joueur)\b/.test(s);
  } catch { return false; }
}

ipcMain.handle('settings:get', async () => {
  try {
    const base = readSettings();
    return { ok: true, settings: base };
  }
  catch (e) { return { ok: false, error: e?.message || String(e) }; }
});
ipcMain.handle('settings:set', async (_evt, patch) => {
  return writeSettings(patch);
});

// Endpoint de maintenance désactivé

// Status handler used by renderer to know readiness / rpc state
ipcMain.handle('launcher:status', async () => {
  try {
    const ready = await checkReady().catch(() => false);
    return { ok: true, ready: !!ready, rpcReady: !!rpcReady };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), ready: false, rpcReady: !!rpcReady };
  }
});

// System info: total RAM in MB
ipcMain.handle('sys:ram:totalMB', async () => {
  try {
    const totalMB = Math.round(os.totalmem() / (1024 * 1024));
    return { ok: true, totalMB };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// App relaunch handler for updater
ipcMain.handle('app:relaunch', async () => {
  try {
    app.relaunch();
    app.quit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// IPC handlers
ipcMain.handle('auth:profile:get', async () => {
  try { return { ok: true, profile: readUserProfile() }; } catch (e) { return { ok: false, error: e?.message || String(e) }; }
});
ipcMain.handle('auth:logout', async () => {
  return logoutEminium();
});

ipcMain.handle('launcher:ensure', async () => {
  try {
    try { setPresencePreparing(); } catch { }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ensure:progress', { phase: 'start', message: 'Préparation en cours...' });
    }
    const res = await ensureAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ensure:progress', { phase: 'done', message: 'Préparation terminée.' });
    }
    try { setPresenceIdle(); } catch { }
    return res;
  } catch (e) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ensure:progress', { phase: 'error', message: e?.message || String(e) });
    }
    throw e;
  }
});

ipcMain.handle('updater:check', async (_evt, payload) => {
  try {
    const force = !!(payload && payload.force);
    const commitApi = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;
    const headers = getGithubHeaders();
    const res = await axios.get(commitApi, { timeout: 15000, headers });
    const sha = String(res?.data?.sha || '').trim();
    if (!sha) return { ok: false, error: 'SHA introuvable' };
    const storeDir = path.join(app.getPath('userData'), 'updates');
    try { fs.mkdirSync(storeDir, { recursive: true }); } catch { }
    const lastFile = path.join(storeDir, 'last_sha.txt');
    let lastSha = '';
    try { lastSha = String(fs.readFileSync(lastFile, 'utf8')).trim(); } catch { }
    // Fetch remote package.json to compare version
    let remoteVersion = '';
    try {
      const pkgApi = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/package.json?ref=${REPO_BRANCH}`;
      const pkgRes = await axios.get(pkgApi, { timeout: 10000, headers });
      const content = pkgRes?.data?.content;
      if (content) {
        const json = JSON.parse(Buffer.from(String(content), 'base64').toString('utf8'));
        if (json && typeof json.version === 'string') remoteVersion = json.version.trim();
      }
    } catch (e) {
      // Non bloquant: si on ne peut pas lire le package.json distant, on continue avec le SHA
      if (isGithubRateLimited(e)) {
        return { ok: true, updateAvailable: false, requireReinstall: false, currentVersion: APP_VERSION, rateLimited: true };
      }
    }

    const requireReinstall = !!(remoteVersion && remoteVersion !== APP_VERSION);
    const updateAvailable = force || requireReinstall || (sha && sha !== lastSha);
    const assetUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/zip/refs/heads/${REPO_BRANCH}`;
    return { ok: true, updateAvailable, requireReinstall, remoteVersion, currentVersion: APP_VERSION, latest: { tag: sha, assetUrl, name: `${REPO_NAME}-${REPO_BRANCH}.zip` } };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('updater:download', async (_evt, payload) => {
  const { assetUrl, tag } = payload || {};
  if (!assetUrl || !tag) return { ok: false, error: 'assetUrl/tag manquant' };
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'start', currentFile: 0, totalFiles: 1, label: 'Préparation du téléchargement' });
    }
    const updatesBase = path.join(app.getPath('userData'), 'updates', tag.replace(/[^a-zA-Z0-9._-]/g, '_'));
    fs.mkdirSync(updatesBase, { recursive: true });
    const destZip = path.join(updatesBase, 'launcher.zip');

    // Stream download with progress
    const dlHeaders = { 'User-Agent': `EminiumLauncher/${APP_VERSION}` };
    try {
      if (process.env.GITHUB_TOKEN) dlHeaders.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    } catch { }
    const resp = await axios.get(assetUrl, { responseType: 'stream', timeout: 60000, maxContentLength: Infinity, maxBodyLength: Infinity, headers: dlHeaders });
    const total = Number(resp.headers['content-length'] || 0);
    let downloaded = 0;
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(destZip);
      resp.data.on('data', (chunk) => {
        downloaded += chunk.length;
        if (mainWindow && !mainWindow.isDestroyed()) {
          const percent = total ? Math.round((downloaded / total) * 100) : Math.min(99, Math.round(downloaded / (1024 * 1024)));
          mainWindow.webContents.send('update:progress', { phase: 'downloading', currentFile: 1, totalFiles: 1, percent });
        }
      });
      resp.data.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', resolve);
      resp.data.pipe(ws);
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'downloaded', message: 'Téléchargement terminé.' });
    }
    return { ok: true, destZip, updatesBase };
  } catch (e) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'error', message: e?.message || String(e) });
    }
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('updater:apply', async (_evt, payload) => {
  const { tag } = payload || {};
  if (!tag) return { ok: false, error: 'tag manquant' };
  try {
    const updatesBase = path.join(app.getPath('userData'), 'updates', tag.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const destZip = path.join(updatesBase, 'launcher.zip');
    const zip = new AdmZip(destZip);
    // Extract to staging
    const staging = path.join(updatesBase, 'staging');
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { }
    fs.mkdirSync(staging, { recursive: true });
    zip.extractAllTo(staging, true);

    // Find repo root folder inside zip (e.g. EminiumLauncher-main)
    const entryNames = fs.readdirSync(staging, { withFileTypes: true });
    const rootName = entryNames.find(e => e.isDirectory())?.name;
    const root = rootName ? path.join(staging, rootName) : staging;

    // Copy selected content to app dir (project root)
    const appDir = path.join(__dirname, '..');
    const copyList = ['assets', 'src', 'package.json', 'package-lock.json', 'node_modules'];
    const ensureDir = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch { } };
    const walkAndCopy = (src, dst) => {
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        ensureDir(dst);
        for (const name of fs.readdirSync(src)) {
          walkAndCopy(path.join(src, name), path.join(dst, name));
        }
      } else if (st.isFile()) {
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
      }
    };

    // Count files for progress
    const listFiles = (dir) => {
      let n = 0; const st = fs.statSync(dir);
      if (st.isFile()) return 1;
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const s = fs.statSync(p);
        n += s.isDirectory() ? listFiles(p) : 1;
      }
      return n;
    };

    let totalFiles = 0;
    for (const item of copyList) {
      const p = path.join(root, item);
      if (fs.existsSync(p)) totalFiles += listFiles(p);
    }
    let currentFile = 0;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'applying', currentFile, totalFiles, label: 'Application de la mise à jour' });
    }
    for (const item of copyList) {
      const srcPath = path.join(root, item);
      if (!fs.existsSync(srcPath)) continue;
      const applyOne = (src, dst) => {
        const st = fs.statSync(src);
        if (st.isDirectory()) {
          ensureDir(dst);
          for (const name of fs.readdirSync(src)) applyOne(path.join(src, name), path.join(dst, name));
        } else if (st.isFile()) {
          ensureDir(path.dirname(dst));
          fs.copyFileSync(src, dst);
          currentFile++;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:progress', { phase: 'applying', currentFile, totalFiles });
          }
        }
      };
      applyOne(srcPath, path.join(appDir, item));
    }
    const storeDir = path.join(app.getPath('userData'), 'updates');
    const lastFile = path.join(storeDir, 'last_sha.txt');
    fs.writeFileSync(lastFile, tag);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'done', message: 'Mise à jour appliquée.' });
    }
    return { ok: true };
  } catch (e) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { phase: 'error', message: e?.message || String(e) });
    }
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('launcher:play', async (_evt, userOpts) => {
  try {
    // Maintenance désactivée: ne plus bloquer le lancement
    const maintenance = false;

    // (VPN/proxy reminder removed)

    // Enforce server availability before launching
    const host = (userOpts && userOpts.serverHost) ? String(userOpts.serverHost) : '82.64.85.47';
    const port = (userOpts && userOpts.serverPort) ? Number(userOpts.serverPort) : 25565; 
    const serverName = (userOpts && userOpts.serverName) ? String(userOpts.serverName) : 'Eminium';
    
    const serverStatus = await checkMinecraftServerStatus(host, port, 5000);
    
    if (!serverStatus.minecraftUp) {
      let errorMsg = `Serveur ${serverName} (${host}:${port}) hors ligne ou inaccessible. Lancement bloqué.`;
      if (serverStatus.error) {
        errorMsg += ` (${serverStatus.error})`;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play:progress', { type: 'error', line: errorMsg });
      }
      return { ok: false, error: errorMsg };
    }
    
    
    // RPC: Préparation du lancement
    try { setPresencePreparing(); } catch { }
    
    // RPC: Connexion au serveur
    try { setPresenceConnecting(serverName); } catch { }
    
    const launcher = await launchMinecraft(userOpts);
    if (launcher) {
      launcher.on('data', (buf) => {
        const line = buf?.toString ? buf.toString() : String(buf);
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play:progress', { type: 'log', line }); } catch { }
        
        // RPC: Détecter le lancement du jeu
        if (line.includes('Launching with arguments') || line.includes('Minecraft Launcher') || line.includes('Starting game')) {
          try { setPresenceLaunching(); } catch { }
        }
        
        // RPC: Détecter la connexion au serveur (plus de patterns)
        if (line.includes('Logging in to') || line.includes('Connecting to') || 
            line.includes('joined the game') || line.includes('Logged in') ||
            line.includes('Server connected') || line.includes('Loading world')) {
          try { setPresencePlaying(serverName); } catch { }
        }
        
        // RPC: Détecter quand le joueur est vraiment en jeu
        if (line.includes('[CHAT]') || line.includes('joined the game') || 
            line.includes('Done') && line.includes('For help')) {
          try { setPresencePlaying(serverName); } catch { }
        }
      });
      launcher.on('debug', (msg) => {
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play:progress', { type: 'debug', line: String(msg) }); } catch { }
      });
      launcher.on('error', (err) => {
        const msg = err?.message || String(err);
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play:progress', { type: 'error', line: msg }); } catch { }
        try { setPresenceIdle(); } catch { }
      });
      // Capture process exit to help diagnose silent failures
      launcher.on('close', (code) => {
        const msg = `Processus Minecraft terminé avec le code ${code}`;
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play:progress', { type: code === 0 ? 'log' : 'error', line: msg }); } catch { }
        try { setPresenceIdle(); } catch { }
        isGameRunning = false;
        // If we closed the window for gameplay, exit the app when the game ends
        if (keepAliveBackground) {
          keepAliveBackground = false;
          // If no window is open, quit the app to fully stop background
          if (BrowserWindow.getAllWindows().length === 0 && process.platform !== 'darwin') {
            try { app.quit(); } catch { }
          }
        }
      });
    }
    try { setPresencePlaying(); } catch { }
    // Option: close launcher window when the game starts, keeping RPC alive
    try {
      const settings = readSettings();
      const closeOnPlay = !!settings.closeOnPlay;
      if (closeOnPlay) {
        isGameRunning = true;
        keepAliveBackground = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Close the window; window-all-closed will not quit while keepAliveBackground is true
          try { mainWindow.close(); } catch { }
        }
      } else {
        isGameRunning = true;
      }
    } catch { isGameRunning = true; }
    return { ok: true };
  } catch (e) {
    dialog.showErrorBox('Lancement Minecraft', e?.message || String(e));
    try { setPresenceIdle(); } catch { }
    return { ok: false, error: e?.message || String(e) };
  }
});

// Préparer/installer ce qui manque
ipcMain.handle('launcher:prepare', async () => {
  try {
    const logger = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play:progress', { line: String(msg) });
      }
    };
    await prepareGame(logger);
    return { ok: true };
  } catch (e) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play:progress', { type: 'error', line: e?.message || String(e) });
    }
    return { ok: false, error: e?.message || String(e) };
  }
});

// Enhanced Minecraft server status check using multiple methods
async function checkMinecraftServerStatus(host, port, timeout = 5000) {
  const results = {
    tcpUp: false,
    minecraftUp: false,
    onlinePlayers: 0,
    maxPlayers: 0,
    version: '',
    motd: '',
    latency: -1,
    error: null
  };

  try {
    // Method 1: TCP ping (basic connectivity)
    const tcpStart = Date.now();
    results.tcpUp = await tcpPing(host, port, timeout);
    results.latency = results.tcpUp ? Date.now() - tcpStart : -1;

    if (!results.tcpUp) {
      results.error = 'Port fermé ou serveur inaccessible';
      return results;
    }

    // Method 2: Minecraft server list API (most reliable)
    try {
      const apiUrl = `https://api.mcsrvstat.us/3/${host}:${port}`;
      const response = await axios.get(apiUrl, { 
        timeout: 3000,
        headers: { 'User-Agent': 'EminiumLauncher/1.0' }
      });
      
      if (response.data && response.data.online) {
        results.minecraftUp = true;
        results.onlinePlayers = response.data.players?.online || 0;
        results.maxPlayers = response.data.players?.max || 0;
        results.version = response.data.version || '';
        results.motd = response.data.motd?.clean || response.data.motd?.raw || '';
        return results;
      }
    } catch (apiError) {
      // API failed, continue to next method
    }

    // Method 3: Alternative API (mc-api.net)
    try {
      const altApiUrl = `https://mc-api.net/v3/server/ping/${host}/${port}`;
      const response = await axios.get(altApiUrl, { 
        timeout: 3000,
        headers: { 'User-Agent': 'EminiumLauncher/1.0' }
      });
      
      if (response.data && response.data.online) {
        results.minecraftUp = true;
        results.onlinePlayers = response.data.players?.online || 0;
        results.maxPlayers = response.data.players?.max || 0;
        results.version = response.data.version || '';
        results.motd = response.data.motd || '';
        return results;
      }
    } catch (altApiError) {
      // Alternative API failed, continue to next method
    }

    // Method 4: Direct Minecraft protocol check (fallback)
    try {
      results.minecraftUp = await minecraftProtocolPing(host, port, 2000);
    } catch (protocolError) {
      // Protocol failed
    }

    if (!results.minecraftUp) {
      results.error = 'Port ouvert mais serveur Minecraft non répondant';
    }

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

// Simple TCP ping (kept as fallback for basic connectivity)
function tcpPing(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const socket = new net.Socket();
    const finalize = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { }
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    try { socket.connect(port, host); } catch { finalize(false); }
  });
}

// Direct Minecraft protocol ping (advanced fallback)
async function minecraftProtocolPing(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;
    
    const cleanup = () => {
      try { socket.destroy(); } catch { }
    };

    socket.setTimeout(timeout);
    
    socket.once('connect', () => {
      connected = true;
      
      // Send Minecraft server list ping packet
      const packet = Buffer.from([
        0x00, // Handshake packet ID
        0x00, // Protocol version (varint - 0 for status)
        ...Buffer.from(host.length.toString(), 'utf8'), // Host length
        ...Buffer.from(host, 'utf8'), // Host name
        (port >> 8) & 0xFF, // Port high byte
        port & 0xFF, // Port low byte
        0x01, // Next state (status)
        0x01, // Status request packet ID
        0x00  // Empty payload
      ]);
      
      socket.write(packet);
    });

    socket.once('data', (data) => {
      if (data.length > 0) {
        cleanup();
        resolve(true);
      }
    });

    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    try {
      socket.connect(port, host);
    } catch {
      cleanup();
      resolve(false);
    }
  });
}

// IPC: Enhanced Minecraft server status check
ipcMain.handle('launcher:ping', async (_evt, { host, port, timeout }) => {
  try {
    if (!host || !port) return { ok: true, up: false, details: null };
    
    const status = await checkMinecraftServerStatus(
      String(host), 
      Number(port), 
      typeof timeout === 'number' ? timeout : 5000
    );
    
    return { 
      ok: true, 
      up: status.minecraftUp, // Use Minecraft status instead of just TCP
      details: {
        tcpUp: status.tcpUp,
        minecraftUp: status.minecraftUp,
        onlinePlayers: status.onlinePlayers,
        maxPlayers: status.maxPlayers,
        version: status.version,
        motd: status.motd,
        latency: status.latency,
        error: status.error
      }
    };
  } catch (e) {
    return { 
      ok: true, 
      up: false, 
      details: { 
        error: e.message,
        tcpUp: false,
        minecraftUp: false,
        onlinePlayers: 0,
        maxPlayers: 0,
        version: '',
        motd: '',
        latency: -1
      }
    };
  }
});
