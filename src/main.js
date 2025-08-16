const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const AdmZip = require('adm-zip');
const axios = require('axios');
const net = require('net');
const { ensureAll, launchMinecraft, readUserProfile, logoutEminium, checkReady, prepareGame } = require('./setup');

let mainWindow;
let windowIcon; // nativeImage pour l'icône

const { loginEminium } = require('./setup.js');
ipcMain.handle('auth:login', async (_evt, { email, password, code }) => {
  return await loginEminium(email, password, code);
});

const REPO_OWNER = 'Eminium-Games';
const REPO_NAME = 'EminiumLauncher';
const REPO_BRANCH = 'main';
const APP_VERSION = (() => {
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return String(pkg.version || '0.0.0');
  } catch { return '0.0.0'; }
})();

function getIconPath() {
  // En dev: ../assets/icon/icon.ico ; En prod: resources/assets/icon/icon.ico (grâce à extraResources)
  const devPath = path.join(__dirname, '..', 'assets', 'icon', 'icon.ico');
  const prodPath = path.join(process.resourcesPath || '', 'assets', 'icon', 'icon.ico');
  return fs.existsSync(devPath) ? devPath : prodPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 620,
    title: 'Eminium Launcher',
    resizable: false,
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

  // Relayer les événements de progression émis côté setup.js (globalThis.emitPlayProgress)
  global.emitPlayProgress = (data) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play:progress', data);
      }
    } catch {}
  };
}

app.whenReady().then(async () => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ensure:progress', { phase: 'start', message: 'Préparation en cours...' });
    }
    const res = await ensureAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ensure:progress', { phase: 'done', message: 'Préparation terminée.' });
    }
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
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': `EminiumLauncher/${APP_VERSION}` };
    try {
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    } catch {}
    const res = await axios.get(commitApi, { timeout: 15000, headers });
    const sha = String(res?.data?.sha || '').trim();
    if (!sha) return { ok: false, error: 'SHA introuvable' };
    const storeDir = path.join(app.getPath('userData'), 'updates');
    try { fs.mkdirSync(storeDir, { recursive: true }); } catch {}
    const lastFile = path.join(storeDir, 'last_sha.txt');
    let lastSha = '';
    try { lastSha = String(fs.readFileSync(lastFile, 'utf8')).trim(); } catch {}
    const updateAvailable = force || (sha && sha !== lastSha);
    const assetUrl = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/zip/refs/heads/${REPO_BRANCH}`;
    return { ok: true, updateAvailable, latest: { tag: sha, assetUrl, name: `${REPO_NAME}-${REPO_BRANCH}.zip` } };
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
    const resp = await axios.get(assetUrl, { responseType: 'stream', timeout: 60000, maxContentLength: Infinity, maxBodyLength: Infinity });
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
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(staging, { recursive: true });
    zip.extractAllTo(staging, true);

    // Find repo root folder inside zip (e.g. EminiumLauncher-main)
    const entryNames = fs.readdirSync(staging, { withFileTypes: true });
    const rootName = entryNames.find(e => e.isDirectory())?.name;
    const root = rootName ? path.join(staging, rootName) : staging;

    // Copy selected content to app dir (project root)
    const appDir = path.join(__dirname, '..');
    const copyList = ['assets', 'src', 'package.json', 'package-lock.json'];
    const ensureDir = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch {} };
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
    // Enforce server availability before launching
    const host = (userOpts && userOpts.serverHost) ? String(userOpts.serverHost) : 'play.eminium.ovh';
    const port = (userOpts && userOpts.serverPort) ? Number(userOpts.serverPort) : 25565;
    const up = await tcpPing(host, port, 2500);
    if (!up) {
      const msg = `Serveur ${host}:${port} hors ligne. Lancement bloqué.`;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play:progress', { type: 'error', line: msg });
      }
      return { ok: false, error: msg };
    }

    const launcher = await launchMinecraft(userOpts);
    if (launcher && mainWindow && !mainWindow.isDestroyed()) {
      launcher.on('data', (buf) => {
        const line = buf?.toString ? buf.toString() : String(buf);
        mainWindow.webContents.send('play:progress', { type: 'log', line });
      });
      launcher.on('debug', (msg) => {
        mainWindow.webContents.send('play:progress', { type: 'debug', line: String(msg) });
      });
      launcher.on('error', (err) => {
        const msg = err?.message || String(err);
        mainWindow.webContents.send('play:progress', { type: 'error', line: msg });
      });
      // Capture process exit to help diagnose silent failures
      launcher.on('close', (code) => {
        const msg = `Processus Minecraft terminé avec le code ${code}`;
        mainWindow.webContents.send('play:progress', { type: code === 0 ? 'log' : 'error', line: msg });
      });
    }
    return { ok: true };
  } catch (e) {
    dialog.showErrorBox('Lancement Minecraft', e?.message || String(e));
    return { ok: false, error: e?.message || String(e) };
  }
});

// Readiness status (fichiers prêts ?)
ipcMain.handle('launcher:status', async () => {
  try {
    return await checkReady();
  } catch (e) {
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

// Simple TCP ping to check if the server port is open
function tcpPing(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const socket = new net.Socket();
    const finalize = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    try { socket.connect(port, host); } catch { finalize(false); }
  });
}

// IPC: ping Minecraft server (port open check)
ipcMain.handle('launcher:ping', async (_evt, { host, port, timeout }) => {
  try {
    if (!host || !port) return { ok: true, up: false };
    const up = await tcpPing(String(host), Number(port), typeof timeout === 'number' ? timeout : 3000);
    return { ok: true, up };
  } catch (e) {
    return { ok: true, up: false };
  }
});