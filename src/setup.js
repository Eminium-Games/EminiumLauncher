const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const http = require('http');
const https = require('https');
const AdmZip = require('adm-zip');
const crypto = require('crypto');           // pour générer un UUID offline si besoin
const { spawn, spawnSync, execFileSync } = require('child_process');
const SITE_URL = 'https://eminium.ovh';     // ton site Azuriom
const { app, ipcMain, BrowserWindow } = require('electron');
const { Client } = require('minecraft-launcher-core');
const discord = require('./discord.js');

// Fonctions de gestion des paramètres
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
    return JSON.parse(raw);
  } catch { return {}; }
}

function writeSettings(obj) {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

// ── Editable constants
const MC_VERSION = '1.21.1';
const FORGE_VERSION = '47.3.0'; // Legacy Forge (pour compatibilité)
const NEOFORGE_VERSION = '21.4.121'; // NeoForge pour Minecraft 1.21.1 (compatible Java 21+)
// Emplacement de stockage "invisible" pour Forge+mods
// userData est déjà une zone app spécifique (ex: %AppData%/Eminium Launcher)
const appDataRoot = path.join(process.cwd(), '..'); // fallback when packaged
const hiddenCore = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'core');
const bundledModpack = path.join(hiddenCore, 'modpack.zip');
// Modpack distant (fourni par l'utilisateur)
const MODPACK_URL = 'https://github.com/Fourty3000/get-zip-for-eminium-launcher/archive/refs/tags/ZIP.zip';

// Configuration NeoForge préinstallé
const NEOFORGE_INSTALL_DIR = path.join(__dirname, '..', 'neoforge');
const NEOFORGE_INSTALLER_PATH = path.join(NEOFORGE_INSTALL_DIR, NEOFORGE_VERSION, `neoforge-${MC_VERSION}-${NEOFORGE_VERSION}-installer.jar`);

// Dossier .eminium (options utilisateur visibles) -> sous AppData (roaming)
const userHome = os.homedir();
const eminiumDir = path.join(app.getPath('appData'), '.eminium');

// Fonction pour obtenir le dossier de jeu spécifique au serveur
function getServerGameDir(serverId) {
  const serverName = serverId === 'server1' ? 'eminiumminijeux' : 'eminiumfactions';
  return path.join(eminiumDir, serverName);
}

// Dossier de travail (caché/opaque au joueur) -> désormais même que .eminium (fusion)
const OLD_HIDDEN_BASE = path.join(os.homedir(), '.eminium-core');
const OLD_EMINIUM_HOME = path.join(os.homedir(), '.eminium');
const hiddenBase = eminiumDir; // unifier tout sous ~/.eminium
const dirs = {
  hiddenBase,
  versions: path.join(hiddenBase, 'versions'),
  libraries: path.join(hiddenBase, 'libraries'),
  assets: path.join(hiddenBase, 'assets'),
  mods: path.join(hiddenBase, 'mods')
};

// AzLink
// Optionnel: pack de mods en .zip déposé dans assets/core/modpack.zip (inclus via extraResources)

// JRE embarqué (option recommandé): placer un dossier "jre" dans assets/core/jre/<platform>

function ensureDir(p) {
  try {
    if (fs.existsSync(p)) {
      const st = fs.lstatSync(p);
      if (st.isFile()) {
        // If a file blocks a directory path (e.g., assets or indexes created as a file), remove it.
        try { fs.unlinkSync(p); } catch {}
        try { fs.mkdirSync(p, { recursive: true }); } catch {}
        return;
      }
      // already a directory (or symlink to dir) -> nothing to do
      return;
    }
    fs.mkdirSync(p, { recursive: true });
  } catch {
    // Last resort: try to recreate
    try { fs.mkdirSync(p, { recursive: true }); } catch {}
  }
}

async function checkAndInstallJava() {
  console.log('[Java] Vérification de Java...');
  
  // Vérifier d'abord le chemin Java personnalisé depuis les paramètres
  try {
    const settings = readSettings();
    const customJavaPath = settings.javaPath;
    
    if (customJavaPath && fs.existsSync(customJavaPath)) {
      console.log(`[Java] Chemin Java personnalisé trouvé: ${customJavaPath}`);
      console.log('[Java] Utilisation directe du chemin Java personnalisé (contournement de validation)');
      return customJavaPath;
    } else if (customJavaPath) {
      console.warn('[Java] Le chemin Java personnalisé n\'existe pas:', customJavaPath);
    }
  } catch (error) {
    console.warn('[Java] Erreur lors de la lecture des paramètres Java:', error.message);
  }
  
  // Vérifier si Java est déjà installé dans le launcher
  const bundledJavaPath = resolveJavaPath();
  if (bundledJavaPath && fs.existsSync(bundledJavaPath)) {
    try {
      const result = spawnSync(bundledJavaPath, ['-version'], { stdio: 'pipe', shell: true });
      const output = result.stderr.toString() || result.stdout.toString();
      
      if (output.includes('21.') || output.includes('17.') || output.includes('22.') || output.includes('23.')) {
        console.log(`[Java] Version détectée: ${output.split('\n')[0]}`);
        
        // Si c'est Java 17, installer Java 21 pour NeoForge
        if (output.includes('17.')) {
          console.log('[Java] Java 17 détecté, installation de Java 21 pour NeoForge...');
          const java21Path = await installJava21();
          if (java21Path && fs.existsSync(java21Path)) {
            console.log('[Java] Java 21 installé et utilisé');
            return java21Path;
          }
          console.log('[Java] Échec de l\'installation de Java 21, utilisation de Java 17');
        }
        
        console.log('[Java] Installation existante trouvée - OK');
        return bundledJavaPath;
      }
    } catch (error) {
      console.warn('[Java] Erreur lors de la vérification:', error.message);
    }
  }
  
  // Vérifier le Java système
  try {
    const result = spawnSync('java', ['-version'], { stdio: 'pipe', shell: true });
    const output = result.stderr.toString() || result.stdout.toString();
    
    if (output.includes('21.') || output.includes('17.') || output.includes('22.') || output.includes('23.')) {
      console.log(`[Java] Version système détectée: ${output.split('\n')[0]}`);
      
      // Si c'est Java 21, l'utiliser directement
      if (output.includes('21.')) {
        console.log('[Java] Java 21 système détecté - OK');
        return 'java';
      }
      
      // Si c'est Java 17, installer Java 21 pour NeoForge
      if (output.includes('17.')) {
        console.log('[Java] Java 17 système détecté, installation de Java 21 pour NeoForge...');
        const java21Path = await installJava21();
        return java21Path || 'java';
      }
      
      console.log('[Java] Java système compatible trouvé - OK');
      return 'java';
    }
  } catch (error) {
    console.warn('[Java] Java système non trouvé ou incompatible');
  }
  
  console.log('[Java] Aucune installation Java compatible trouvée');
  console.log('[Java] Veuillez configurer un chemin Java personnalisé dans les paramètres');
  return null;
}

async function installJava21() {
  console.log('[Java] Installation automatique désactivée - utilisation du Java personnalisé requis');
  return null;
}

// Migration: déplacer l'ancien contenu de ~/.eminium-core vers ~/.eminium
function migrateFromOldHiddenBase(log) {
  try {
    ensureDir(hiddenBase);

    const moveAll = (srcBase, label) => {
      if (!srcBase || srcBase === hiddenBase) return;
      if (!fs.existsSync(srcBase)) return;
      const entries = fs.readdirSync(srcBase, { withFileTypes: true });
      for (const e of entries) {
        const src = path.join(srcBase, e.name);
        const dst = path.join(hiddenBase, e.name);
        try {
          if (e.isDirectory()) {
            try { fs.renameSync(src, dst); }
            catch {
              copyDir(src, dst);
              try { fs.rmSync(src, { recursive: true, force: true }); } catch {}
            }
          } else if (e.isFile()) {
            ensureDir(path.dirname(dst));
            try { fs.renameSync(src, dst); }
            catch { try { fs.copyFileSync(src, dst); fs.unlinkSync(src); } catch {} }
          }
        } catch {}
      }
      // cleanup if empty
      try { fs.rmdirSync(srcBase); } catch {}
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Migration] Données déplacées de ${label} vers AppData/.eminium` }); } catch {}
      log && log(`[Migration] Terminé ${label} -> AppData/.eminium`);
    };

    // Migrer depuis l'ancien ~/.eminium-core
    moveAll(OLD_HIDDEN_BASE, '.eminium-core');
    // Migrer depuis l'ancien ~/.eminium (home) si différent d'AppData
    if (OLD_EMINIUM_HOME !== eminiumDir) moveAll(OLD_EMINIUM_HOME, 'home/.eminium');
  } catch {}
}

// Fallback: récupérer l'URL du JSON de version via le manifest
async function tryFetchVersionJsonViaManifest(mcVersion, destPath, log) {
  const cacheDir = path.join(hiddenBase, 'cache');
  ensureDir(cacheDir);
  const mfPath = path.join(cacheDir, 'version_manifest.json');
  log && log('[BMCL] Récupération du manifest de versions');
  await fetchWithFallback(BMCL.manifest(), mfPath, 'version manifest');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(mfPath, 'utf-8'));
  } catch (e) {
    throw new Error('Manifest JSON illisible');
  }
  const versions = manifest?.versions || [];
  const entry = versions.find(v => v.id === mcVersion);
  if (!entry) {
    throw new Error(`Version ${mcVersion} introuvable dans le manifest`);
  }
  const candidates = [];
  if (entry.url) candidates.push(entry.url);
  // ajouter nos URL BMCL directes également
  candidates.push(...BMCL.versionJson(mcVersion));
  // Dédupliquer
  const uniq = [...new Set(candidates.filter(Boolean))];
  log && log(`[BMCL] Résolution via manifest (${uniq.length} URL candidates)`);
  await fetchWithFallback(uniq, destPath, `version ${mcVersion} json (manifest)`);
}

function setHiddenWindows(p) {
  if (process.platform === 'win32' && fs.existsSync(p)) {
    try {
      require('child_process').execSync(`attrib +H "${p}"`);
    } catch {}
  }
}

const jreRoot = path.join(app.getPath('userData'), 'jre');

// Copy all necessary JRE files to target directory
async function copyJdkFiles(jreDir, targetDir) {
  // Pour le JRE, la structure est déjà correcte, il suffit de déplacer le contenu
  console.log('[Java] Déplacement des fichiers JRE...');
  
  // Vérifier si le contenu est déjà dans un sous-dossier (ex: jdk-21-jre/)
  const entries = fs.readdirSync(jreDir, { withFileTypes: true });
  const jreSubDir = entries.find(entry => 
    entry.isDirectory() && (entry.name.includes('jre') || entry.name.includes('jdk'))
  );
  
  const sourceDir = jreSubDir ? path.join(jreDir, jreSubDir.name) : jreDir;
  
  // Vider le dossier cible d'abord
  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  } catch {}
  
  // Déplacer tous les fichiers et dossiers
  await copyDirectory(sourceDir, targetDir);
}

// Copy directory recursively with permission handling
async function copyDirectory(src, dst) {
  ensureDir(dst);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, dstPath);
    } else {
      try {
        fs.copyFileSync(srcPath, dstPath);
      } catch (copyError) {
        if (copyError.code === 'EPERM' || copyError.code === 'EACCES') {
          // Demander les permissions administrateur
          const { dialog } = require('electron');
          const result = await dialog.showMessageBox({
            type: 'warning',
            title: 'Permissions requises',
            message: 'Java 21 nécessite des permissions administrateur pour s\'installer.',
            detail: 'Voulez-vous relancer le launcher avec des permissions administrateur ?',
            buttons: ['Oui', 'Non'],
            defaultId: 0
          });
          
          if (result.response === 0) {
            // Relancer avec les permissions administrateur
            const { execSync } = require('child_process');
            const scriptPath = process.execPath;
            const args = process.argv.slice(1).join(' ');
            const platform = process.platform;
            
            // Sur Windows, utiliser PowerShell pour demander l'élévation
            if (platform === 'win32') {
              const command = `Start-Process "${scriptPath}" -ArgumentList "${args}" -Verb RunAs`;
              execSync(`powershell -Command "${command}"`, { detached: true });
            } else {
              // Sur macOS/Linux, utiliser sudo
              execSync(`sudo "${scriptPath}" ${args}`, { detached: true });
            }
            
            // Quitter l'instance actuelle
            if (global.mainWindow && !global.mainWindow.isDestroyed()) {
              global.mainWindow.close();
            }
            app.quit();
            process.exit(0);
          } else {
            throw new Error('Installation de Java 21 annulée par l\'utilisateur.');
          }
        } else {
          throw copyError;
        }
      }
    }
  }
}

// Install Java 21 automatically if needed
async function installJava21(force = false) {
  const platform = process.platform;
  const arch = process.arch;
  let java21Url, targetDir, executableName;
  
  if (platform === 'win32') {
    // Utiliser Adoptium (Eclipse Temurin) - plus fiable et stable
    java21Url = arch === 'arm64' 
      ? 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_aarch64_windows_hotspot_21.0.10_11.zip'
      : 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_x64_windows_hotspot_21.0.10_11.zip';
    targetDir = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'core', 'jre', 'win');
    executableName = 'java.exe';
  } else if (platform === 'darwin') {
    java21Url = arch === 'arm64'
      ? 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.10_11.tar.gz'
      : 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_x64_mac_hotspot_21.0.10_11.tar.gz';
    targetDir = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'core', 'jre', 'mac', 'Contents', 'Home');
    executableName = 'java';
  } else {
    java21Url = arch === 'arm64'
      ? 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_aarch64_linux_hotspot_21.0.10_11.tar.gz'
      : 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B11/OpenJDK21U-jre_x64_linux_hotspot_21.0.10_11.tar.gz';
    targetDir = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'core', 'jre', 'linux');
    executableName = 'java';
  }
  
  try {
    // Vérifier si Java 21 est déjà installé et fonctionnel
    if (!force) {
      const javaExe = path.join(targetDir, 'bin', executableName);
      if (fs.existsSync(javaExe)) {
        console.log('[Java] Java 21 déjà détecté, validation de l\'installation...');
        try {
          const { spawnSync } = require('child_process');
          const result = spawnSync(javaExe, ['-version'], { encoding: 'utf8', windowsHide: true });
          const versionOutput = [result.stdout || '', result.stderr || ''].join('\n');
          const versionMatch = versionOutput.match(/version "(\d+)/);
          
          if (versionMatch && parseInt(versionMatch[1]) >= 21) {
            console.log('[Java] Java 21 déjà installé et fonctionnel');
            return; // Installation déjà valide
          }
        } catch (validationError) {
          console.log('[Java] Installation existante invalide, réinstallation...');
        }
      }
    }
    
    console.log('[Java] Téléchargement de Java 21 depuis BellSoft...');
    ensureDir(targetDir);
    
    // Supprimer l'ancienne installation si elle existe
    try {
      if (fs.existsSync(targetDir)) {
        console.log('[Java] Suppression de l\'ancienne installation...');
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    } catch {}
    
    ensureDir(targetDir);
    
    const tempFile = path.join(targetDir, 'java21-temp' + (platform === 'win32' ? '.zip' : '.tar.gz'));
    await aSYNC_GET(java21Url, tempFile);
    
    console.log('[Java] Extraction de Java 21...');
    const zip = new AdmZip(tempFile);
    zip.extractAllTo(targetDir, true);
    
    // Nettoyer le fichier temporaire
    try { fs.unlinkSync(tempFile); } catch {}
    
    // Trouver le dossier JRE extrait et le déplacer
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const jreEntry = entries.find(entry => 
      entry.isDirectory() && entry.name.includes('jre')
    );
    
    if (jreEntry) {
      const jreDir = path.join(targetDir, jreEntry.name);
      const tempDir = path.join(targetDir, 'temp-jre');
      
      // Déplacer le contenu du JRE vers un dossier temporaire
      await copyDirectory(jreDir, tempDir);
      
      // Supprimer l'ancien contenu
      try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
      ensureDir(targetDir);
      
      // Déplacer le contenu du JRE vers la cible
      await copyDirectory(tempDir, targetDir);
    }
  } catch (error) {
    console.error('[Java] Erreur lors de la vérification Java:', error);
    // Essayer de trouver le Java système
    const systemJava = findSystemJava();
    if (systemJava) {
      console.log('[Java] Utilisation du Java système:', systemJava);
      return systemJava;
    }
    throw new Error('Java requis pour lancer Minecraft');
  }
}

// Find system Java installation
function findSystemJava() {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('where', ['java'], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout) {
      const javaPath = result.stdout.trim().split('\n')[0];
      if (fs.existsSync(javaPath)) {
        return javaPath;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Try to resolve a bundled Java runtime shipped with the app
function resolveJavaPath() {
  try {
    // Expected layout: assets/core/jre/<platform>/bin/java(.exe|w.exe)
    const platform = process.platform;
    const jreRootBase = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'core', 'jre')
      : path.join(app.getAppPath(), 'assets', 'core', 'jre');
    let candidates = [];
    if (platform === 'win32') {
      const win = path.join(jreRootBase, 'win', 'bin');
      // Prefer java.exe first (better for -version checks)
      candidates = [
        path.join(win, 'java.exe'),
        path.join(win, 'javaw.exe')
      ];
    } else if (platform === 'darwin') {
      const mac = path.join(jreRootBase, 'mac', 'Contents', 'Home', 'bin');
      candidates = [path.join(mac, 'java')];
    } else {
      const linux = path.join(jreRootBase, 'linux', 'bin');
      candidates = [path.join(linux, 'java')];
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    // Light debug to help during dev
    console.warn('[JRE] Non trouvé. Base recherchée =', jreRootBase, 'candidats =', candidates);
  } catch (e) {
    try { console.warn('[JRE] resolveJavaPath error:', e?.message || String(e)); } catch {}
  }
  return undefined;
}

function ensureBaseFolders() {
  // Exécuter la migration avant de créer les dossiers
  try { migrateFromOldHiddenBase(); } catch {}
  Object.values(dirs).forEach(ensureDir);
  ensureDir(eminiumDir);
  ensureDir(jreRoot);
  setHiddenWindows(hiddenBase);
}

function ensureUserOptions() {
  const optionsTxt = path.join(eminiumDir, 'options.txt');
  if (!fs.existsSync(optionsTxt)) {
    fs.writeFileSync(optionsTxt, '# Eminium user options\n');
  }
}

function ensureMirrorsFile() {
  try {
    ensureDir(eminiumDir);
    const p = path.join(eminiumDir, 'mirrors.json');
    if (!fs.existsSync(p)) {
      const tpl = {
        disableDefaults: false,
        versionJson: [],
        clientJar: [],
        assetsIndex: [],
        assetObj: []
      };
      fs.writeFileSync(p, JSON.stringify(tpl, null, 2));
    }
  } catch {}
}

async function importBundledModpackIfAny() {
  if (fs.existsSync(bundledModpack)) {
    const zip = new AdmZip(bundledModpack);
    zip.extractAllTo(hiddenBase, true);
  }
}

// Utilitaire: copier récursivement (overwrite)
function copyDir(src, dst) {
  ensureDir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}

// Synchroniser le modpack depuis un ZIP distant
// Version modifiée de syncModpackFromUrl pour un serveur spécifique
async function syncModpackFromUrlForServer(url, serverDirs, log) {
  try {
    if (!url) return;
    const cacheDir = path.join(serverDirs.root, 'cache');
    ensureDir(cacheDir);
    const destZip = path.join(cacheDir, 'modpack.zip');
    log && log(`[Modpack] Téléchargement depuis ${url}`);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Téléchargement...` }); } catch {}
    await aSYNC_GET(url, destZip);
    // Vérifier le zip
    let zip;
    try {
      zip = new AdmZip(destZip);
      const entries = zip.getEntries();
      if (!entries || entries.length === 0) throw new Error('zip vide');
    } catch (e) {
      throw new Error(`Modpack ZIP invalide: ${e?.message || e}`);
    }
    // Extraire vers un dossier temporaire
    const tmp = path.join(serverDirs.root, 'tmp_modpack');
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    ensureDir(tmp);
    zip.extractAllTo(tmp, true);
    // Debug: lister la racine extraite
    try {
      const rootEntries = fs.readdirSync(tmp, { withFileTypes: true }).map(e => `${e.isDirectory() ? '[D]':'[F]'} ${e.name}`);
      const msg = `[Modpack] Contenu extrait (racine): ${rootEntries.join(', ')}`;
      console.log(msg);
      if (globalThis.emitPlayProgress) try { globalThis.emitPlayProgress({ line: msg }); } catch {}
    } catch {}
    // Détecter les dossiers de mods/config/resourcepacks
    let modsSrc = null;
    let configSrc = null;
    let resourcepacksSrc = null;
    try {
      const rootEntries = fs.readdirSync(tmp, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(tmp, entry.name);
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
          // Mods
          if (!modsSrc && subEntries.some(e => e.isFile() && e.name.endsWith('.jar'))) {
            modsSrc = fullPath;
          }
          // Config
          if (!configSrc && subEntries.some(e => e.isFile() && e.name.endsWith('.cfg') || e.name.endsWith('.json'))) {
            configSrc = fullPath;
          }
          // Resourcepacks
          if (!resourcepacksSrc && subEntries.some(e => e.isFile() && e.name.endsWith('.zip'))) {
            resourcepacksSrc = fullPath;
          }
        }
      }
    } catch (e) {
      console.log('[Modpack] Erreur détection dossiers:', e.message);
    }
    // Synchroniser les mods
    if (modsSrc) {
      const modsDest = serverDirs.mods;
      ensureDir(modsDest);
      const modFiles = fs.readdirSync(modsSrc).filter(f => f.endsWith('.jar'));
      for (const modFile of modFiles) {
        const srcPath = path.join(modsSrc, modFile);
        const destPath = path.join(modsDest, modFile);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
      log && log(`[Modpack] ${modFiles.length} mod(s) synchronisés`);
    } else {
      // Fallback: chercher les .jar directement à la racine
      try {
        const rootJars = fs.readdirSync(tmp).filter(f => f.endsWith('.jar'));
        if (rootJars.length > 0) {
          const modsDest = serverDirs.mods;
          ensureDir(modsDest);
          for (const jar of rootJars) {
            const srcPath = path.join(tmp, jar);
            const destPath = path.join(modsDest, jar);
            if (!fs.existsSync(destPath)) {
              fs.copyFileSync(srcPath, destPath);
            }
          }
          log && log(`[Modpack] Mods synchronisés (fallback jar)`);
        }
      } catch {}
    }
    // Synchroniser les configs
    if (configSrc) {
      const configDest = path.join(serverDirs.root, 'config');
      ensureDir(configDest);
      copyDir(configSrc, configDest);
      log && log(`[Modpack] Configs synchronisées`);
    }
    // Synchroniser les resourcepacks
    if (resourcepacksSrc) {
      const rpDest = path.join(serverDirs.root, 'resourcepacks');
      ensureDir(rpDest);
      copyDir(resourcepacksSrc, rpDest);
      log && log(`[Modpack] Resource packs synchronisés`);
    }
    // Nettoyer le temporaire
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    // Lister les mods installés et vérifier la compatibilité
    try {
      const modsDest = serverDirs.mods;
      if (fs.existsSync(modsDest)) {
        let installedMods = fs.readdirSync(modsDest).filter(f => f.endsWith('.jar'));
        log && log(`[Modpack] ${installedMods.length} mod(s) détectés`);
        installedMods.forEach(mod => log && log(`- ${mod}`));
        
        // Détecter et désactiver les mods incompatibles avec 1.21.4
        const incompatibleMods = installedMods.filter(mod => 
          mod.toLowerCase().includes('betterf3') && 
          (mod.toLowerCase().includes('1.21.1') || !mod.toLowerCase().includes('1.21.4'))
        );
        
        if (incompatibleMods.length > 0) {
          log && log(`[Modpack] ⚠️ Désactivation des mods incompatibles avec 1.21.4:`);
          incompatibleMods.forEach(mod => {
            const modPath = path.join(modsDest, mod);
            const disabledPath = path.join(modsDest, `${mod}.disabled`);
            if (fs.existsSync(modPath)) {
              fs.renameSync(modPath, disabledPath);
              log && log(`[Modpack] ❌ ${mod} -> ${mod}.disabled`);
            }
          });
          
          // Recalculer la liste des mods actifs
          installedMods = fs.readdirSync(modsDest).filter(f => f.endsWith('.jar'));
          log && log(`[Modpack] ${installedMods.length} mod(s) actifs après nettoyage`);
        }
      }
    } catch {}
    // Lister les resourcepacks installés
    try {
      const rpDest = path.join(serverDirs.root, 'resourcepacks');
      if (fs.existsSync(rpDest)) {
        const packs = fs.readdirSync(rpDest).filter(f => f.endsWith('.zip'));
        if (packs.length > 0) {
          log && log(`[Modpack] Resource packs synchronisés`);
          log && log(`[Modpack] Packs: ${packs.join(', ')}`);
        }
      }
    } catch {}
  } catch (e) {
    log && log(`[Modpack] Erreur: ${e.message}`);
    // Continuer quand même
  }
}

async function syncModpackFromUrl(url, log) {
  try {
    if (!url) return;
    const cacheDir = path.join(hiddenBase, 'cache');
    ensureDir(cacheDir);
    const destZip = path.join(cacheDir, 'modpack.zip');
    log && log(`[Modpack] Téléchargement depuis ${url}`);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Téléchargement...` }); } catch {}
    await aSYNC_GET(url, destZip);
    // Vérifier le zip
    let zip;
    try {
      zip = new AdmZip(destZip);
      const entries = zip.getEntries();
      if (!entries || entries.length === 0) throw new Error('zip vide');
    } catch (e) {
      throw new Error(`Modpack ZIP invalide: ${e?.message || e}`);
    }
    // Extraire vers un dossier temporaire
    const tmp = path.join(hiddenBase, 'tmp_modpack');
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    ensureDir(tmp);
    zip.extractAllTo(tmp, true);
    // Debug: lister la racine extraite
    try {
      const rootEntries = fs.readdirSync(tmp, { withFileTypes: true }).map(e => `${e.isDirectory() ? '[D]':'[F]'} ${e.name}`);
      const msg = `[Modpack] Contenu extrait (racine): ${rootEntries.join(', ')}`;
      console.log(msg);
      if (globalThis.emitPlayProgress) try { globalThis.emitPlayProgress({ line: msg }); } catch {}
    } catch {}

    // Chercher mods/config/resourcepacks à travers plusieurs conventions d'archives
    const tryPaths = (base) => [
      path.join(base, 'mods'),
      path.join(base, 'config'),
      path.join(base, 'resourcepacks'),
      path.join(base, 'overrides', 'mods'),
      path.join(base, 'overrides', 'config'),
      path.join(base, 'overrides', 'resourcepacks'),
      path.join(base, '.minecraft', 'mods'),
      path.join(base, '.minecraft', 'config'),
      path.join(base, '.minecraft', 'resourcepacks'),
      path.join(base, 'get-zip-for-eminium-launcher-ZIP4', 'mods')
    ];
    const existsDir = (p) => p && fs.existsSync(p) && fs.statSync(p).isDirectory();
    const findDirByNameDepth = (base, name, maxDepth=8) => {
      try {
        const q = [];
        q.push({ dir: base, depth: 0 });
        while (q.length) {
          const { dir, depth } = q.shift();
          if (depth > maxDepth) continue;
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              if (e.name.toLowerCase() === name.toLowerCase()) return full;
              q.push({ dir: full, depth: depth + 1 });
            }
          }
        }
      } catch {}
      return null;
    };

    let modsSrc = path.join(tmp, 'mods');
    let cfgSrc = path.join(tmp, 'config');
    let rpSrc = path.join(tmp, 'resourcepacks');

    // Cas GitHub: un dossier parent unique
    if (!existsDir(modsSrc) && !existsDir(cfgSrc)) {
      const top = fs.readdirSync(tmp, { withFileTypes: true }).filter(d => d.isDirectory());
      if (top.length === 1) {
        const base = path.join(tmp, top[0].name);
        const candidates = tryPaths(base);
        const foundMods = candidates.find(p => p.endsWith(path.sep + 'mods') && existsDir(p)) || findDirByNameDepth(base, 'mods');
        const foundCfg = candidates.find(p => p.endsWith(path.sep + 'config') && existsDir(p)) || findDirByNameDepth(base, 'config');
        const foundRp = candidates.find(p => p.endsWith(path.sep + 'resourcepacks') && existsDir(p)) || findDirByNameDepth(base, 'resourcepacks');
        if (foundMods) modsSrc = foundMods;
        if (foundCfg) cfgSrc = foundCfg;
        if (foundRp) rpSrc = foundRp;
      }
    }

    // Dernière tentative: chercher n'importe quel dossier "mods"/"config" peu profond
    if (!existsDir(modsSrc)) modsSrc = findDirByNameDepth(tmp, 'mods') || modsSrc;
    if (!existsDir(cfgSrc)) cfgSrc = findDirByNameDepth(tmp, 'config') || cfgSrc;
    if (!existsDir(rpSrc)) rpSrc = findDirByNameDepth(tmp, 'resourcepacks') || rpSrc;

    // Debug: chemins retenus
    try {
      const dbg = `[Modpack] Chemins détectés -> modsSrc: ${existsDir(modsSrc)?modsSrc:'(introuvable)'} | configSrc: ${existsDir(cfgSrc)?cfgSrc:'(introuvable)'} | resourcepacks: ${existsDir(rpSrc)?rpSrc:'(introuvable)'} `;
      console.log(dbg);
      if (globalThis.emitPlayProgress) try { globalThis.emitPlayProgress({ line: dbg }); } catch {}
    } catch {}
    // Purger/copier mods: avec fallback si pas de dossier mods détecté
    const modsDst = dirs.mods;
    const listJarFiles = (dir) => {
      const acc = [];
      const walk = (p) => {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          const full = path.join(p, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.isFile() && e.name.toLowerCase().endsWith('.jar')) acc.push(full);
        }
      };
      try { walk(dir); } catch {}
      return acc;
    };

    let usedJarFallback = false;
    if (fs.existsSync(modsSrc)) {
      try { if (fs.existsSync(modsDst)) fs.rmSync(modsDst, { recursive: true, force: true }); } catch {}
      ensureDir(modsDst);
      copyDir(modsSrc, modsDst);
      log && log('[Modpack] Mods synchronisés');
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Mods synchronisés` }); } catch {}
    } else {
      // Fallback: scanner toutes les .jar dans l'archive et les copier à la racine mods
      const allJars = listJarFiles(tmp);
      if (allJars.length > 0) {
        usedJarFallback = true;
        const msg = `[Modpack] Aucun dossier mods détecté, fallback: ${allJars.length} fichier(s) .jar trouvé(s)`;
        console.warn(msg);
        try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ type: 'warn', line: msg }); } catch {}
        try { if (fs.existsSync(modsDst)) fs.rmSync(modsDst, { recursive: true, force: true }); } catch {}
        ensureDir(modsDst);
        for (const src of allJars) {
          const dst = path.join(modsDst, path.basename(src));
          try { fs.copyFileSync(src, dst); } catch {}
        }
        log && log('[Modpack] Mods synchronisés (fallback jar)');
        try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Mods synchronisés (fallback jar)` }); } catch {}
      } else {
        const warn = '[Modpack] Aucun dossier mods ni .jar détecté dans l\'archive.';
        console.warn(warn);
        try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ type: 'warn', line: warn }); } catch {}
      }
    }

    // Lister les fichiers .jar pour visibilité (quelle que soit la méthode)
    try {
      const jars = listJarFiles(modsDst).map(p => path.basename(p)).sort((a,b)=>a.localeCompare(b));
      const header = `[Modpack] ${jars.length} mod(s) détectés`;
      console.log(header);
      if (globalThis.emitPlayProgress) try { globalThis.emitPlayProgress({ line: header }); } catch {}
      for (const name of jars) {
        const line = `  - ${name}`;
        console.log(line);
        if (globalThis.emitPlayProgress) try { globalThis.emitPlayProgress({ line }); } catch {}
      }
    } catch {}
    // Fusionner config (overwrite)
    if (fs.existsSync(cfgSrc)) {
      const cfgDst = path.join(hiddenBase, 'config');
      ensureDir(cfgDst);
      copyDir(cfgSrc, cfgDst);
      log && log('[Modpack] Config synchronisée');
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Config synchronisée` }); } catch {}
    }
    // Synchroniser resourcepacks (overwrite du dossier)
    if (fs.existsSync(rpSrc)) {
      const rpDst = path.join(hiddenBase, 'resourcepacks');
      try { if (fs.existsSync(rpDst)) fs.rmSync(rpDst, { recursive: true, force: true }); } catch {}
      ensureDir(rpDst);
      copyDir(rpSrc, rpDst);
      log && log('[Modpack] Resource packs synchronisés');
      try {
        if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `[Modpack] Resource packs synchronisés` });
        // Lister quelques packs copiés
        try {
          const names = fs.readdirSync(rpDst, { withFileTypes: true })
            .filter(e => e.isFile() || e.isDirectory())
            .map(e => e.name);
          globalThis.emitPlayProgress({ line: `[Modpack] Packs: ${names.slice(0,10).join(', ')}${names.length>10?` (+${names.length-10})`:''}` });
        } catch {}
      } catch {}
    }
    // Nettoyage
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  } catch (e) {
    // Non bloquant: on log seulement
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ type: 'error', line: `[Modpack] ${e?.message || e}` }); } catch {}
  }
}

function forgeInstallerUrl(mc, forge) {
  const coord = `${mc}-${forge}`;
  return [
    // Forge official maven
    `https://maven.minecraftforge.net/net/minecraftforge/forge/${coord}/forge-${coord}-installer.jar`,
    // BMCL mirror
    `https://bmclapi2.bangbang93.com/forge/download/${coord}`
  ];
}

async function ensureForgeInstaller(mc, forge) {
  const cacheDir = path.join(hiddenBase, 'cache');
  ensureDir(cacheDir);
  const dest = path.join(cacheDir, `forge-${mc}-${forge}-installer.jar`);
  const isValidZip = (file) => {
    try {
      const zip = new AdmZip(file);
      // Access entries to force zip parsing
      const entries = zip.getEntries();
      if (!entries || entries.length === 0) return false;
      // Forge installer must contain these
      const need1 = zip.getEntry('data/client.lzma');
      const need2 = zip.getEntry('install_profile.json');
      if (!need1 || !need2) return false;
      if (need1.header?.size === 0) return false;
      return true;
    } catch {
      return false;
    }
  };
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 100) {
    // Validate cached jar; if corrupted, remove and redownload
    if (isValidZip(dest)) return dest;
    try { fs.unlinkSync(dest); } catch {}
  }
  const urls = forgeInstallerUrl(mc, forge);
  let lastErr;
  for (const url of urls) {
    try {
      await aSYNC_GET(url, dest);
      if (fs.existsSync(dest)) {
        if (isValidZip(dest)) return dest;
        // Corrupted download → delete and try next mirror
        try { fs.unlinkSync(dest); } catch {}
        lastErr = new Error('Forge installer corrompu (zip invalide)');
        continue;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Impossible de télécharger l'installeur Forge ${mc}-${forge}: ${lastErr?.message || lastErr}`);
}

// Fonction pour utiliser un NeoForge préinstallé
async function usePreInstalledNeoForge(mc, neoforge) {
  console.log(`[NeoForge] Recherche NeoForge préinstallé version ${neoforge}...`);
  
  // Chemin prioritaire : notre installation complète
  const primaryPath = NEOFORGE_INSTALLER_PATH;
  
  if (fs.existsSync(primaryPath)) {
    console.log(`[NeoForge] NeoForge préinstallé trouvé: ${primaryPath}`);
    
    // Valider que le fichier est un zip valide
    try {
      const zip = new AdmZip(primaryPath);
      const entries = zip.getEntries();
      if (entries && entries.length > 0) {
        const need1 = zip.getEntry('data/client.lzma');
        const need2 = zip.getEntry('install_profile.json');
        if (need1 && need2) {
          console.log(`[NeoForge] Fichier préinstallé valide ✓`);
          console.log(`[NeoForge] Installation complète NeoForge utilisée`);
          return primaryPath;
        }
      }
    } catch (e) {
      console.warn(`[NeoForge] Fichier préinstallé invalide: ${primaryPath} - ${e.message}`);
    }
  }
  
  // Chemins alternatifs (compatibilité)
  const possiblePaths = [
    path.join(__dirname, '..', 'neoforge', `${neoforge}`, `neoforge-${mc}-${neoforge}-installer.jar`),
    path.join(__dirname, '..', 'neoforge', `neoforge-${mc}-${neoforge}-installer.jar`),
    path.join(process.resourcesPath || '.', 'neoforge', `${neoforge}`, `neoforge-${mc}-${neoforge}-installer.jar`),
    path.join(process.resourcesPath || '.', 'neoforge', `neoforge-${mc}-${neoforge}-installer.jar`),
    path.join(app.getPath('userData'), 'neoforge', `${neoforge}`, `neoforge-${mc}-${neoforge}-installer.jar`),
    path.join(app.getPath('userData'), 'neoforge', `neoforge-${mc}-${neoforge}-installer.jar`)
  ];
  
  for (const neoForgePath of possiblePaths) {
    if (fs.existsSync(neoForgePath)) {
      console.log(`[NeoForge] NeoForge alternatif trouvé: ${neoForgePath}`);
      
      // Valider que le fichier est un zip valide
      try {
        const zip = new AdmZip(neoForgePath);
        const entries = zip.getEntries();
        if (entries && entries.length > 0) {
          const need1 = zip.getEntry('data/client.lzma');
          const need2 = zip.getEntry('install_profile.json');
          if (need1 && need2) {
            console.log(`[NeoForge] Fichier alternatif valide ✓`);
            return neoForgePath;
          }
        }
      } catch (e) {
        console.warn(`[NeoForge] Fichier alternatif invalide: ${neoForgePath} - ${e.message}`);
      }
    }
  }
  
  console.log(`[NeoForge] Aucun NeoForge préinstallé trouvé pour la version ${neoforge}`);
  console.log(`[NeoForge] Veuillez exécuter: node scripts\\install-neoforge.js`);
  return null;
}

// NeoForge installer function (separate from Forge)
async function ensureNeoForgeInstaller(mc, neoforge) {
  // Utiliser le NeoForge préinstallé, mais tenter de l'installer si corrompu
  console.log(`[NeoForge] Recherche du NeoForge préinstallé version ${neoforge}...`);
  
  const primaryPath = NEOFORGE_INSTALLER_PATH;
  if (fs.existsSync(primaryPath)) {
    try {
      const testZip = new AdmZip(primaryPath);
      if (testZip.getEntry('data/client.lzma') && testZip.getEntry('install_profile.json')) {
        console.log(`[NeoForge] Utilisation du NeoForge préinstallé: ${primaryPath}`);
        return primaryPath;
      }
    } catch (e) {
      console.log('[NeoForge] Installateur pré-installé corrompu, tentative de réinstallation...');
    }
  }
  
  // Tenter d'installer NeoForge si non trouvé ou corrompu
  console.log('[NeoForge] Installation de NeoForge...');
  const { spawn } = require('child_process');
  const installScript = path.join(__dirname, '..', 'scripts', 'install-neoforge.js');
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [installScript], { 
      stdio: 'pipe',
      cwd: path.dirname(installScript)
    });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(primaryPath)) {
        try {
          const testZip = new AdmZip(primaryPath);
          if (testZip.getEntry('data/client.lzma') && testZip.getEntry('install_profile.json')) {
            console.log('[NeoForge] Installation réussie et validée');
            resolve(primaryPath);
          } else {
            reject(new Error('Installateur NeoForge installé mais invalide'));
          }
        } catch (e) {
          reject(new Error('Installateur NeoForge corrompu après installation'));
        }
      } else {
        reject(new Error(`Échec installation NeoForge (code: ${code}): ${output}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Erreur installation NeoForge: ${err.message}`));
    });
  });
}

// Patch l'installateur NeoForge pour forcer la bonne version
async function patchNeoForgeInstaller(installerPath, targetVersion) {
  try {
    const zip = new AdmZip(installerPath);
    const profileEntry = zip.getEntry('install_profile.json');
    
    if (profileEntry) {
      const profileData = profileEntry.getData().toString('utf8');
      const profile = JSON.parse(profileData);
      
      // Forcer la version NeoForge dans le profil
      if (profile.version && (profile.version.includes('21.4.156') || profile.version.includes('21.4.157') || profile.version.includes('21.4.158') || profile.version.includes('21.4.159'))) {
        console.log(`[NeoForge] Patch de l'installateur: ${profile.version} -> ${targetVersion}`);
        profile.version = targetVersion;
        
        // Mettre à jour les spécifications de version
        if (profile.spec && profile.spec.minecraftVersion) {
          profile.spec.minecraftVersion = '1.21.1';
        }
        
        // Réécrire le fichier dans le zip
        const updatedProfileData = JSON.stringify(profile, null, 2);
        zip.updateFile('install_profile.json', Buffer.from(updatedProfileData, 'utf8'));
        
        // Sauvegarder le zip modifié
        zip.writeZip(installerPath);
        
        console.log(`[NeoForge] Installateur patché avec succès pour la version ${targetVersion}`);
      }
    }
  } catch (error) {
    console.warn('[NeoForge] Erreur lors du patch de l\'installateur:', error.message);
  }
}

// Patch ForgeWrapper pour forcer la bonne version
async function patchForgeWrapper(targetVersion) {
  try {
    const forgeWrapperPath = path.join(hiddenBase, 'libraries', 'io', 'github', 'zekerzhayard', 'ForgeWrapper', '1.6.0', 'ForgeWrapper-1.6.0.jar');
    
    if (fs.existsSync(forgeWrapperPath)) {
      const zip = new AdmZip(forgeWrapperPath);
      const mainClassEntry = zip.getEntry('io/github/zekerzhayard/forgewrapper/installer/Main.class');
      
      if (mainClassEntry) {
        console.log(`[ForgeWrapper] Patch de ForgeWrapper pour forcer la version ${targetVersion}`);
        
        // Forcer la version dans les arguments par défaut
        // Note: c'est une solution de dernier recours, le bytecode modification est complexe
        // On va plutôt créer un wrapper script
        
        const wrapperScript = `@echo off
set FML_NEOFORGE_VERSION=${targetVersion}
set FML_FML_VERSION=6.0.18
set FML_MC_VERSION=1.21.1
set FML_NEOFORM_VERSION=20241203.161809
java %*`;
        
        const wrapperPath = path.join(hiddenBase, 'forgewrapper-forced.bat');
        fs.writeFileSync(wrapperPath, wrapperScript);
        
        console.log(`[ForgeWrapper] Wrapper script créé: ${wrapperPath}`);
      }
    }
  } catch (error) {
    console.warn('[ForgeWrapper] Erreur lors du patch de ForgeWrapper:', error.message);
  }
}

// Client Axios keep-alive pour accélérer les téléchargements
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, rejectUnauthorized: false });
const axiosClient = axios.create({
  timeout: 45000,
  httpAgent,
  httpsAgent,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  validateStatus: (s) => s >= 200 && s < 300
});

// Téléchargement utilitaire
aSYNC_GET = async function(url, dest) {
  const dir = path.dirname(dest);
  ensureDir(dir);
  // Try to make sure directory is writable
  try { fs.chmodSync(dir, 0o700); } catch {}

  const attemptWrite = async () => {
    // Clean destination if it exists with the wrong type
    try {
      if (fs.existsSync(dest)) {
        const st = fs.lstatSync(dest);
        if (st.isDirectory()) {
          try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
        } else {
          try { fs.unlinkSync(dest); } catch {}
        }
      }
    } catch {}

    const tmp = dest + '.tmp-download';
    // Clean temp if present
    try {
      if (fs.existsSync(tmp)) {
        const st = fs.lstatSync(tmp);
        if (st.isDirectory()) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
        else { try { fs.unlinkSync(tmp); } catch {} }
      }
    } catch {}

    const res = await axiosClient({ url, method: 'GET', responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tmp);
      res.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    // Validate and move into place atomically if possible
    const stat = fs.existsSync(tmp) ? fs.statSync(tmp) : null;
    if (!stat || stat.size === 0) {
      try { fs.unlinkSync(tmp); } catch {}
      throw new Error(`Empty download for ${url}`);
    }
    // Ensure parent dir still exists and is writable
    ensureDir(dir);
    try { fs.chmodSync(dir, 0o700); } catch {}
    try {
      fs.renameSync(tmp, dest);
    } catch (e) {
      // As a fallback copy and then remove tmp
      try {
        const data = fs.readFileSync(tmp);
        fs.writeFileSync(dest, data);
        try { fs.unlinkSync(tmp); } catch {}
      } catch (e2) {
        try { fs.unlinkSync(tmp); } catch {}
        throw e2;
      }
    }
  };

  // Retry a couple of times to get past transient EPERM/locks
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await attemptWrite();
      return;
    } catch (e) {
      lastErr = e;
      // Try to relax attributes and wait a bit on Windows locks
      try { fs.chmodSync(dir, 0o700); } catch {}
      await new Promise(r => setTimeout(r, 200 + i * 150));
    }
  }
  throw lastErr || new Error(`Failed to download to ${dest}`);
};

// ========================
// Préparation offline via BMCL (avec overrides)
// ========================
function readMirrorOverrides() {
  try {
    const p = path.join(eminiumDir, 'mirrors.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    }
  } catch {}
  return {};
}

const MIRROR_OVERRIDES = readMirrorOverrides();
const MIRRORS_DISABLE_DEFAULTS = !!MIRROR_OVERRIDES.disableDefaults;

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const BMCL = {
  versionJson: (mc) => {
    const o = asArray(MIRROR_OVERRIDES.versionJson?.replace?.('{mc}', mc) || MIRROR_OVERRIDES.versionJson?.map?.(u => u.replace('{mc}', mc)) || []);
    const def = [
      `https://bmclapi2.bangbang93.com/version/${mc}/json`
    ];
    return MIRRORS_DISABLE_DEFAULTS && o.length ? o : [...o, ...def];
  },
  clientJar: (mc) => {
    const o = asArray(MIRROR_OVERRIDES.clientJar?.replace?.('{mc}', mc) || MIRROR_OVERRIDES.clientJar?.map?.(u => u.replace('{mc}', mc)) || []);
    const def = [
      `https://bmclapi2.bangbang93.com/version/${mc}/client`
    ];
    return MIRRORS_DISABLE_DEFAULTS && o.length ? o : [...o, ...def];
  },
  assetsIndex: (id) => {
    const o = asArray(MIRROR_OVERRIDES.assetsIndex?.replace?.('{id}', id) || MIRROR_OVERRIDES.assetsIndex?.map?.(u => u.replace('{id}', id)) || []);
    const def = [
      `https://bmclapi2.bangbang93.com/assets/indexes/${id}.json`
    ];
    return MIRRORS_DISABLE_DEFAULTS && o.length ? o : [...o, ...def];
  },
  assetObj: (hash) => {
    const sub = hash.slice(0,2);
    const o = asArray(MIRROR_OVERRIDES.assetObj?.replace?.('{sub}', sub)?.replace?.('{hash}', hash)
      || MIRROR_OVERRIDES.assetObj?.map?.(u => u.replace('{sub}', sub).replace('{hash}', hash)) || []);
    const def = [
      // Official Mojang assets CDN (primary)
      `https://resources.download.minecraft.net/${sub}/${hash}`,
      // BMCL mirror as fallback
      `https://bmclapi2.bangbang93.com/assets/${sub}/${hash}`
    ];
    return MIRRORS_DISABLE_DEFAULTS && o.length ? o : [...o, ...def];
  },
  manifest: () => {
    const o = asArray(MIRROR_OVERRIDES.manifest || []);
    const def = [
      // Mojang piston-meta v2 (official)
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
      // BMCL mirror as fallback
      'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json'
    ];
    return MIRRORS_DISABLE_DEFAULTS && o.length ? o : [...o, ...def];
  },
  maven: (pathPart) => {
    const list = [];
    // Prefer Mojang official libraries CDN
    list.push(`https://libraries.minecraft.net/${pathPart}`);
    // BMCL mirror as fallback
    list.push(`https://bmclapi2.bangbang93.com/maven/${pathPart}`);
    // Forge official maven for forge artifacts
    if (/^(net\/minecraftforge\/|cpw\/mods\/|org\/spongepowered\/|io\/github\/zekerzhayard\/|it\/.+\/fastutil)/.test(pathPart)) {
      list.push(`https://maven.minecraftforge.net/${pathPart}`);
    }
    return list;
  }
};

function libPathFromUrl(url) {
  // .../maven/group/artifact/version/artifact-version(-classifier).jar -> libraries/group/artifact/version/...
  const idx = url.indexOf('/maven/');
  const rel = idx >= 0 ? url.slice(idx + 8) : url.replace(/^https?:\/\/[\w.-]+\//, '');
  return path.join(dirs.libraries, rel.replace(/\//g, path.sep));
}

// Version modifiée de ensureVersionFilesBMCL pour un serveur spécifique
async function ensureVersionFilesForServer(mcVersion, serverDirs, log) {
  ensureDir(serverDirs.versions);
  const vDir = path.join(serverDirs.versions, mcVersion);
  ensureDir(vDir);

  const vJsonPath = path.join(vDir, `${mcVersion}.json`);
  const vJarPath = path.join(vDir, `${mcVersion}.jar`);

  // If previous runs created directories where files should be, remove them
  try {
    if (fs.existsSync(vJsonPath) && fs.lstatSync(vJsonPath).isDirectory()) {
      try { fs.rmSync(vJsonPath, { recursive: true, force: true }); } catch {}
    }
  } catch {}
  try {
    if (fs.existsSync(vJarPath) && fs.lstatSync(vJarPath).isDirectory()) {
      try { fs.rmSync(vJarPath, { recursive: true, force: true }); } catch {}
    }
  } catch {}

  let assetsId = mcVersion;
  if (fs.existsSync(vJsonPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
      assetsId = manifest.assets || mcVersion;
    } catch (e) {
      log(`[Assets] Erreur lecture ${vJsonPath}: ${e.message}`);
    }
  }

  // Télécharger version JSON si manquant
  if (!fs.existsSync(vJsonPath)) {
    log(`[DL] Téléchargement JSON ${mcVersion}`);
    await fetchWithFallback(BMCL.versionManifest(mcVersion), vJsonPath, 'version JSON', true);
  }

  // Télécharger client JAR si manquant
  if (!fs.existsSync(vJarPath)) {
    log(`[DL] Téléchargement client.jar ${mcVersion}`);
    const manifest = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
    const clientUrl = manifest.downloads?.client?.url;
    if (clientUrl) {
      await fetchWithFallback(clientUrl, vJarPath, 'client jar', true);
    } else {
      throw new Error(`URL client.jar non trouvée dans ${mcVersion}.json`);
    }
  }

  // Télécharger assets
  const assetsDir = serverDirs.assets;
  ensureDir(assetsDir);
  const assetsIndexPath = path.join(assetsDir, `indexes/${assetsId}.json`);
  ensureDir(path.dirname(assetsIndexPath));

  if (!fs.existsSync(assetsIndexPath)) {
    log(`[DL] Téléchargement assets index ${assetsId}`);
    const manifest = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
    const assetIndexUrl = manifest.assetIndex?.url;
    if (assetIndexUrl) {
      await fetchWithFallback(assetIndexUrl, assetsIndexPath, 'assets index', true);
    } else {
      throw new Error(`URL assets index non trouvée pour ${assetsId}`);
    }
  }

  // Télécharger les fichiers assets
  const assetsIndex = JSON.parse(fs.readFileSync(assetsIndexPath, 'utf8'));
  const objects = assetsIndex.objects || {};
  const assetsObjectsDir = path.join(assetsDir, 'objects');
  ensureDir(assetsObjectsDir);

  let downloaded = 0;
  const total = Object.keys(objects).length;
  if (total > 0) {
    log(`[Assets] Téléchargement de ${total} fichiers assets...`);
    for (const [assetName, assetInfo] of Object.entries(objects)) {
      const hash = assetInfo.hash;
      const hashDir = hash.substring(0, 2);
      const assetFile = path.join(assetsObjectsDir, hashDir, hash);
      ensureDir(path.dirname(assetFile));
      
      if (!fs.existsSync(assetFile)) {
        const assetUrl = BMCL.asset(hash);
        await fetchWithFallback(assetUrl, assetFile, `asset ${assetName}`, false);
        downloaded++;
        if (downloaded % 10 === 0) {
          log(`[Assets] ${downloaded}/${total} fichiers téléchargés...`);
        }
      }
    }
    log(`[Assets] Téléchargement terminé: ${downloaded} nouveaux fichiers`);
  }

  // Télécharger les bibliothèques
  const manifest = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
  const libraries = manifest.libraries || [];
  const librariesDir = serverDirs.libraries;
  ensureDir(librariesDir);

  log(`[Libraries] Vérification de ${libraries.length} bibliothèques...`);
  for (const lib of libraries) {
    if (lib.rules) {
      // Skip libraries that don't apply
      const allow = lib.rules.every(rule => {
        if (rule.action === 'allow') {
          return !rule.os || rule.os.name === 'windows';
        }
        if (rule.action === 'disallow') {
          return rule.os && rule.os.name !== 'windows';
        }
        return true;
      });
      if (!allow) continue;
    }

    const libPath = lib.downloads?.artifact?.path;
    if (!libPath) continue;

    const libFile = path.join(librariesDir, libPath);
    ensureDir(path.dirname(libFile));

    if (!fs.existsSync(libFile)) {
      const libUrl = lib.downloads.artifact.url;
      await fetchWithFallback(libUrl, libFile, `library ${lib.name}`, false);
    }
  }
  log(`[Libraries] Bibliothèques vérifiées`);
}

async function ensureVersionFilesBMCL(mcVersion, log) {
  ensureDir(dirs.versions);
  const vDir = path.join(dirs.versions, mcVersion);
  ensureDir(vDir);

  const vJsonPath = path.join(vDir, `${mcVersion}.json`);
  const vJarPath = path.join(vDir, `${mcVersion}.jar`);

  // If previous runs created directories where files should be, remove them
  try {
    if (fs.existsSync(vJsonPath) && fs.lstatSync(vJsonPath).isDirectory()) {
      try { fs.rmSync(vJsonPath, { recursive: true, force: true }); } catch {}
    }
  } catch {}
  try {
    if (fs.existsSync(vJarPath) && fs.lstatSync(vJarPath).isDirectory()) {
      try { fs.rmSync(vJarPath, { recursive: true, force: true }); } catch {}
    }
  } catch {}

  if (!fs.existsSync(vJsonPath)) {
    log && log(`[BMCL] Téléchargement JSON ${mcVersion}`);
    try {
      await fetchWithFallback(BMCL.versionJson(mcVersion), vJsonPath, `version ${mcVersion} json`);
    } catch (e) {
      // Fallback via manifest if direct endpoints fail
      await tryFetchVersionJsonViaManifest(mcVersion, vJsonPath, log);
    }
  }
  let vJsonRaw = '';
  let vJson;
  try {
    vJsonRaw = fs.readFileSync(vJsonPath, 'utf-8');
    vJson = JSON.parse(vJsonRaw);
  } catch (e) {
    log && log(`[BMCL] JSON ${mcVersion} corrompu, nouvel essai...`);
    // Supprimer le fichier corrompu et retenter via manifest
    try { fs.unlinkSync(vJsonPath); } catch {}
    try {
      await fetchWithFallback(BMCL.versionJson(mcVersion), vJsonPath, `version ${mcVersion} json (retry)`);
    } catch {
      await tryFetchVersionJsonViaManifest(mcVersion, vJsonPath, log);
    }
    vJsonRaw = fs.readFileSync(vJsonPath, 'utf-8');
    vJson = JSON.parse(vJsonRaw);
  }

  if (!fs.existsSync(vJarPath)) {
    log && log(`[DL] Téléchargement client.jar ${mcVersion}`);
    // Prefer official Mojang URL from version JSON if available, then fall back to BMCL mirror
    const clientUrls = [];
    try {
      const u = vJson?.downloads?.client?.url;
      if (u) clientUrls.push(u);
    } catch {}
    const fallbacks = BMCL.clientJar(mcVersion);
    await fetchWithFallback([...clientUrls, ...fallbacks], vJarPath, `client jar ${mcVersion}`);
  }

  // Assets index
  ensureDir(path.join(dirs.assets, 'indexes'));
  const assetsId = vJson?.assets || vJson?.assetIndex?.id;
  if (assetsId) {
    const idxPath = path.join(dirs.assets, 'indexes', `${assetsId}.json`);
    // If idxPath exists but is a directory, clean it so we can write/read a file
    try {
      if (fs.existsSync(idxPath)) {
        const st = fs.lstatSync(idxPath);
        if (st.isDirectory()) {
          try { fs.rmSync(idxPath, { recursive: true, force: true }); } catch {}
        }
      }
    } catch {}
    if (!fs.existsSync(idxPath)) {
      log && log(`[DL] Téléchargement assets index ${assetsId}`);
      // Prefer the direct Mojang URL from version JSON, then fall back to BMCL mirror
      const idxUrls = [];
      if (vJson?.assetIndex?.url) idxUrls.push(vJson.assetIndex.url);
      const bmclIdx = BMCL.assetsIndex(assetsId);
      await fetchWithFallback([...idxUrls, ...bmclIdx], idxPath, `assets index ${assetsId}`);
    }
    // Assets objects
    let idxJsonRaw = '';
    let idxJson;
    try {
      idxJsonRaw = fs.readFileSync(idxPath, 'utf-8');
      idxJson = JSON.parse(idxJsonRaw);
    } catch (e) {
      log && log(`[DL] Index d'assets corrompu, nouvel essai...`);
      try { fs.unlinkSync(idxPath); } catch {}
      {
        const idxUrls = [];
        if (vJson?.assetIndex?.url) idxUrls.push(vJson.assetIndex.url);
        const bmclIdx = BMCL.assetsIndex(assetsId);
        await fetchWithFallback([...idxUrls, ...bmclIdx], idxPath, `assets index ${assetsId} (retry)`);
      }
      idxJsonRaw = fs.readFileSync(idxPath, 'utf-8');
      idxJson = JSON.parse(idxJsonRaw);
    }
    const objects = idxJson.objects || {};
    ensureDir(path.join(dirs.assets, 'objects'));
    const entries = Object.entries(objects);
    const total = entries.length;
    let processed = 0;

    // Téléchargement concurrent contrôlé
    const CONCURRENCY = 12;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= entries.length) return;
        const obj = entries[i][1];
        const hash = obj.hash;
        const sub = hash.slice(0,2);
        const destDir = path.join(dirs.assets, 'objects', sub);
        ensureDir(destDir);
        const dest = path.join(destDir, hash);
        // Télécharger si absent
        let didDownload = false;
        if (!fs.existsSync(dest)) {
          await fetchWithFallback(BMCL.assetObj(hash), dest, `asset ${hash}`);
          didDownload = true;
        }
        // Marquer comme complété et émettre une progression monotone
        processed += 1;
        // N'émettre une ligne texte que si un téléchargement a réellement eu lieu
        if (didDownload) {
          log && log(`[BMCL] Asset ${processed}/${total} ${hash}`);
        }
        try {
          if (globalThis.emitPlayProgress) {
            globalThis.emitPlayProgress({ type: 'asset', current: processed, total, hash });
          }
        } catch {}
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, () => worker());
    await Promise.all(workers);
  }

  // Helper: validate a jar file
  const isValidJar = (file) => {
    try {
      if (!fs.existsSync(file)) return false;
      if (!file.toLowerCase().endsWith('.jar')) return true; // non-jar files handled elsewhere
      const stat = fs.statSync(file);
      if (stat.size < 1024) return false;
      const zip = new AdmZip(file);
      const entries = zip.getEntries();
      return Array.isArray(entries) && entries.length > 0;
    } catch {
      return false;
    }
  };

  // Libraries (artifact + classifiers): affichage 1 à 1
  ensureDir(dirs.libraries);
  const libs = vJson?.libraries || [];
  // Construire la liste des éléments à télécharger (manquants)
  const libItems = [];
  for (const lib of libs) {
    const art = lib.downloads?.artifact;
    if (art && art.url && art.path) {
      const dest = path.join(dirs.libraries, art.path.replace(/\//g, path.sep));
      const need = !fs.existsSync(dest) || !isValidJar(dest);
      if (need) {
        libItems.push({ kind: 'library', pathPart: art.path, dest });
      }
    }
    const classifiers = lib.downloads?.classifiers || {};
    for (const key of Object.keys(classifiers)) {
      const clf = classifiers[key];
      if (clf && clf.path && clf.url) {
        const dest = path.join(dirs.libraries, clf.path.replace(/\//g, path.sep));
        const need = !fs.existsSync(dest) || !isValidJar(dest);
        if (need) {
          libItems.push({ kind: 'classifier', pathPart: clf.path, dest });
        }
      }
    }
  }
  const totalLibs = libItems.length;
  let doneLibs = 0;
  for (const item of libItems) {
    ensureDir(path.dirname(item.dest));
    const urls = BMCL.maven(item.pathPart);
    // Télécharger uniquement si manquant (sécurité en cas de courses simultanées)
    const shouldFetch = !fs.existsSync(item.dest) || !isValidJar(item.dest);
    if (shouldFetch) {
      await fetchWithFallback(urls, item.dest, `${item.kind} ${item.pathPart}`, true);
      // Log + événement UI pour chaque téléchargement effectif
      doneLibs += 1;
      log && log(`[BMCL] ${item.kind === 'library' ? 'Librairie' : 'Classifier'} ${doneLibs}/${totalLibs} ${item.pathPart}`);
    } else {
      doneLibs += 1;
    }
    try {
      if (globalThis.emitPlayProgress) {
        globalThis.emitPlayProgress({ type: 'library', current: doneLibs, total: totalLibs, path: item.pathPart, kind: item.kind });
      }
    } catch {}
  }

  return { vJsonPath };
}

async function fetchWithFallback(urls, dest, label='resource', validateJar=false) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr;
  for (const url of list) {
    try {
      await aSYNC_GET(url, dest);
      if (fs.existsSync(dest)) {
        if (validateJar && dest.toLowerCase().endsWith('.jar')) {
          try {
            const zip = new AdmZip(dest);
            const entries = zip.getEntries();
            if (!entries || entries.length === 0) throw new Error('jar vide');
          } catch (e) {
            try { fs.unlinkSync(dest); } catch {}
            lastErr = new Error(`Jar corrompu depuis ${url}`);
            continue; // essayer prochain miroir
          }
        }
        return;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Echec de téléchargement (${label}) via miroirs: ${lastErr?.message || lastErr}`);
}


async function ensureAll() {
  await ensureBaseFolders();
  await ensureUserOptions();
  ensureMirrorsFile();
  await importBundledModpackIfAny();
  return {
    ok: true,
    paths: { hiddenBase, eminiumDir }
  };
}

// Test de connexion au serveur
async function testServerConnection() {
  const url = `${SITE_URL}/api/ping`;
  try {
    const start = Date.now();
    const response = await axios.get(url, { timeout: 10000 });
    const ping = Date.now() - start;
    return { 
      online: true, 
      ping,
      status: response.status,
      version: response.data?.version
    };
  } catch (error) {
    return {
      online: false,
      error: error.code || 'connection_failed',
      message: error.message || 'Impossible de se connecter au serveur'
    };
  }
}

// ===== AUTH AZURIOM — helpers =====

// UUID offline (même algo que les launchers offline)
function uuidFromName(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; // version 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // variant
  const hex = md5.toString('hex');
  return (
    hex.substring(0, 8) + '-' +
    hex.substring(8, 12) + '-' +
    hex.substring(12, 16) + '-' +
    hex.substring(16, 20) + '-' +
    hex.substring(20)
  );
}

const userProfilePath = path.join(eminiumDir, 'user.json');

function readUserProfile() {
  try {
    if (fs.existsSync(userProfilePath)) {
      return JSON.parse(fs.readFileSync(userProfilePath, 'utf8'));
    }
  } catch {}
  return null;
}

function writeUserProfile(profile) {
  ensureDir(eminiumDir);
  fs.writeFileSync(userProfilePath, JSON.stringify(profile, null, 2));
}

function logoutEminium() {
  try {
    if (fs.existsSync(userProfilePath)) fs.unlinkSync(userProfilePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function loginEminium(email, password, twoFactorCode) {
  // Validation des entrées
  if (!email || !password) {
    return { 
      status: 'error',
      reason: 'validation',
      message: 'L\'email et le mot de passe sont requis.'
    };
  }

  const url = `${SITE_URL}/api/auth/authenticate`;
  const payload = {
    email: email.trim(),
    password: password,
    ...(twoFactorCode ? { code: twoFactorCode.trim() } : {})
  };

  console.log('Tentative de connexion à:', url);
  console.log('Payload:', JSON.stringify({
    ...payload,
    password: '***' // Ne pas logger le mot de passe en clair
  }));

  let res;
  try {
    const startTime = Date.now();
    res = await axios.post(
      url,
      payload,
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'EminiumLauncher/1.0',
          'X-Eminium-Version': '1.0.0'
        },
        timeout: 30000, // Augmentation du timeout à 30 secondes
        validateStatus: status => status < 500, // Valider les réponses < 500 comme réussies
        maxRedirects: 5,
        httpsAgent: new (require('https').Agent)({  
          rejectUnauthorized: true,
          keepAlive: true
        })
      }
    );
    const responseTime = Date.now() - startTime;
    console.log(`Réponse reçue en ${responseTime}ms - Status: ${res.status}`);
    console.log('Réponse du serveur (données):', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Erreur lors de la connexion:', err);
    
    // Gestion des erreurs réseau
    if (err.code === 'ECONNABORTED') {
      return { status: 'error', reason: 'timeout', message: 'Le serveur met trop de temps à répondre' };
    }
    
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { status: 'error', reason: 'server_unreachable', message: 'Impossible de joindre le serveur' };
    }
    
    // Si le serveur renvoie une erreur JSON, essayons de la parser
    const data = err?.response?.data;
    const status = err?.response?.status;
    
    if (status === 422) {
      // Erreur de validation (mauvais format d'email, mot de passe trop court, etc.)
      const message = data?.message || 'Données de connexion invalides';
      const errors = data?.errors ? Object.values(data.errors).flat().join(', ') : '';
      return { 
        status: 'error', 
        reason: 'validation', 
        message: `${message} ${errors}`.trim()
      };
    }
    
    if (status === 401) {
      // Non autorisé (mauvais identifiants)
      return { 
        status: 'error', 
        reason: 'unauthorized', 
        message: 'Email ou mot de passe incorrect'
      };
    }
    
    if (status === 403) {
      // Compte banni ou suspendu
      return { 
        status: 'error', 
        reason: 'forbidden', 
        message: 'Accès refusé. Votre compte est peut-être suspendu.'
      };
    }
    
    // Cas 2FA requis via status pending/reason 2fa
    if (data && data.status === 'pending' && (data.reason === '2fa' || data.reason === 'two_factor')) {
      return { status: 'pending', reason: '2fa', message: 'Code de vérification requis' };
    }
    
    // Autres erreurs avec réponse du serveur
    if (data && typeof data === 'object') {
      return { 
        status: 'error', 
        reason: data.reason || 'server_error', 
        message: data.message || 'Erreur lors de la connexion'
      };
    }
    
    // Erreur réseau ou de connexion
    return { 
      status: 'error', 
      reason: 'network', 
      message: err?.message || 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.'
    };
  }

  const data = res?.data || {};
  // Gestion du flux 2FA si l'API répond 200 avec pending
  if (data.status === 'pending' && (data.reason === '2fa' || data.reason === 'two_factor')) {
    return { status: 'pending', reason: '2fa' };
  }

  // Succès attendu: user fields + access_token
  const name = data.username || data.name || data.nickname || 'EminiumPlayer';
  const uuid = data.uuid || uuidFromName(name);

  // Normalize grade from possible role/grade structures (string | object | array)
  const pickGradeName = (v) => {
    try {
      if (!v) return null;
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        const parts = v.map(pickGradeName).filter(Boolean);
        return parts.length ? parts.join(', ') : null;
      }
      if (typeof v === 'object') {
        const cand = v.name || v.title || v.displayName || v.label || v.slug || v.role;
        return cand ? String(cand) : null;
      }
      return String(v);
    } catch { return null; }
  };
  const normalizeHex = (c) => {
    if (!c) return null;
    let s = String(c).trim();
    // Accept like #RRGGBB or RRGGBB
    if (/^#?[0-9a-fA-F]{6}$/.test(s)) return s.startsWith('#') ? s : `#${s}`;
    // Accept short #RGB
    if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
      s = s.replace('#','');
      const r = s[0]; const g = s[1]; const b = s[2];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return null;
  };
  const pickGradeColor = (v) => {
    try {
      if (!v) return null;
      if (typeof v === 'string') return null; // string roles don't carry color
      if (Array.isArray(v)) {
        for (const it of v) {
          const c = pickGradeColor(it);
          if (c) return c;
        }
        return null;
      }
      if (typeof v === 'object') {
        const cand = v.color || v.colour || v.hex || v.primary_color || v.primaryColor || null;
        return normalizeHex(cand);
      }
      return null;
    } catch { return null; }
  };
  const gradeName = pickGradeName(data.grade || data.role || null);
  const gradeColor = pickGradeColor(data.role || data.grade || null);

  const profile = {
    id: data.id ?? null,
    name,
    uuid,
    email: data.email ?? null,
    role: data.role ?? null,
    grade: gradeName || null,
    gradeColor: gradeColor || null,
    banned: !!data.banned,
    created_at: data.created_at ?? null,
    access_token: data.access_token || null,
    obtainedAt: new Date().toISOString()
  };

  writeUserProfile(profile);
  return { status: 'success', profile };
}


async function launchMinecraft({ memoryMB = 2048, serverHost = '82.64.85.47', serverPort = 25565, version = MC_VERSION, forgeVersion = FORGE_VERSION, useModpack = true, modpackUrl = MODPACK_URL, serverName = 'Eminium', serverId = 'server1' } = {}) {

  const profile = readUserProfile();
  if (!profile) {
    throw new Error('Aucun profil utilisateur trouvé. Connectez-vous d’abord.');
  }

  // Utiliser le dossier spécifique au serveur
  const serverGameDir = getServerGameDir(serverId);
  console.log(`[Launch] Dossier de jeu pour ${serverName}: ${serverGameDir}`);
  try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Dossier de jeu: ${serverGameDir}` }); } catch {}

  const launcher = new Client();

  // Auth offline stricte pour éviter tout appel à authserver.mojang.com
  const auth = {
    access_token: '0',
    client_token: '0',
    uuid: profile.uuid,
    name: profile.name,
    user_properties: {},
    meta: { type: 'offline' }
  };

  // Préparation offline via BMCL (évite Mojang)
  const log = (msg) => {
    console.log('[BMCL]', msg);
    if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: msg });
  };

  // Créer les dossiers nécessaires pour le serveur
  const serverDirs = {
    versions: path.join(serverGameDir, 'versions'),
    libraries: path.join(serverGameDir, 'libraries'),
    assets: path.join(serverGameDir, 'assets'),
    mods: path.join(serverGameDir, 'mods')
  };
  
  Object.values(serverDirs).forEach(dir => ensureDir(dir));
  console.log(`[Launch] Dossiers du serveur créés: ${Object.keys(serverDirs).join(', ')}`);
  
  // Synchroniser le modpack distant uniquement si nécessaire
  if (useModpack) {
    await syncModpackFromUrlForServer(modpackUrl, { ...serverDirs, root: serverGameDir }, (m) => console.log(m));
  }
  
  // Utiliser une version modifiée de ensureVersionFilesBMCL pour le serveur
  await ensureVersionFilesForServer(version, serverDirs, log);

  // Trouver l'installateur (Forge ou NeoForge)
  const installerPath = useModpack ? (forgeVersion.startsWith('21.') ? await ensureNeoForgeInstaller(version, forgeVersion) : await ensureForgeInstaller(version, forgeVersion)) : null;
  const isUsingNeoForge = useModpack && forgeVersion.startsWith('21.');
  console.log(`[Launch] Installateur: ${installerPath ? 'OUI' : 'NON'} (NeoForge: ${isUsingNeoForge ? 'OUI' : 'NON'})`);

  // Validation de l'installateur
  if (useModpack && installerPath) {
    try {
      const testZip = new AdmZip(installerPath);
      if (!testZip.getEntry('data/client.lzma') || !testZip.getEntry('install_profile.json')) {
        throw new Error(`Installateur ${isUsingNeoForge ? 'NeoForge' : 'Forge'} invalide`);
      }
      console.log(`[Launch] Installateur ${isUsingNeoForge ? 'NeoForge' : 'Forge'} valide ✓`);
    } catch (e) {
      throw new Error(`Installateur ${isUsingNeoForge ? 'NeoForge' : 'Forge'} corrompu: ${e.message}`);
    }
  }

  // Configuration Java
  let javaPath = resolveJavaPath();
  if (!javaPath) {
    javaPath = await checkAndInstallJava();
  }
  console.log(`[Launch] Java trouvé: ${javaPath}`);

  // Configuration du launcher avec dossier serveur spécifique et version 1.21.1
  const opts = {
    root: serverGameDir,
    version: { number: '1.21.1', type: 'release' }, // Minecraft 1.21.1
    ...(useModpack && installerPath ? { forge: installerPath } : {}),
    javaPath,
    quickPlay: { multiplayer: { host: serverHost, port: serverPort } },
    memory: { max: `${memoryMB}M`, min: '512M' },
    authorization: auth,
    extraArguments: [],
    // Forcer l'utilisation des dossiers du serveur avec chemins absolus
    assets: path.join(serverGameDir, 'assets'),
    libraries: path.join(serverGameDir, 'libraries'),
    versions: path.join(serverGameDir, 'versions'),
    // Désactiver les téléchargements automatiques qui causent des blocages
    downloadOptional: false,
    overwrite: false,
    // Forcer l'utilisation de l'installateur local
    installerPath: installerPath
  };

  // Ajouter les arguments NeoForge si nécessaire (version correcte 21.1.221 pour 1.21.1)
  if (isUsingNeoForge) {
    // Utiliser la version correcte pour 1.21.1
    const compatibleForgeVersion = forgeVersion.startsWith('21.') ? '21.1.221' : forgeVersion;
    opts.extraArguments = [
      '--fml.neoForgeVersion', compatibleForgeVersion,
      '--fml.fmlVersion', '6.0.1',   // Version FML pour 1.21.1
      '--fml.mcVersion', '1.21.1',   // Minecraft 1.21.1
      '--fml.neoFormVersion', '20240814.144718' // NeoForm pour 1.21.1
    ];
    console.log(`[Launch] Arguments NeoForge 21.1.221 pour 1.21.1: ${opts.extraArguments.join(' ')}`);
  }

  // Validation Java plus stricte
  console.log(`[Launch] Validation de Java: ${javaPath}`);
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync(javaPath, ['-version'], { stdio: 'pipe', shell: true, timeout: 10000 });
    if (result.error) {
      throw new Error(`Java inaccessible: ${result.error.message}`);
    }
    const output = result.stderr.toString() || result.stdout.toString();
    console.log(`[Launch] Java validé: ${output.split('\n')[0]}`);
  } catch (e) {
    throw new Error(`Java validation failed: ${e.message}`);
  }

  // Forcer les variables d'environnement pour NeoForge (version 21.1.221 pour 1.21.1)
  if (isUsingNeoForge) {
    const compatibleForgeVersion = forgeVersion.startsWith('21.') ? '21.1.221' : forgeVersion;
    process.env.FML_NEOFORGE_VERSION = compatibleForgeVersion;
    process.env.FML_FML_VERSION = '6.0.1';    // FML pour 1.21.1
    process.env.FML_MC_VERSION = '1.21.1';    // Minecraft 1.21.1
    process.env.FML_NEOFORM_VERSION = '20240814.144718'; // NeoForm pour 1.21.1
  }

  // Logs du launcher avec gestion d'événements complète
  launcher.on('debug', (e) => {
    console.log('[MC DEBUG]', e);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `DEBUG: ${e}` }); } catch {}
  });
  launcher.on('data', (e) => {
    console.log('[MC]', e.toString());
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `MC: ${e.toString()}` }); } catch {}
  });
  launcher.on('error', (error) => {
    console.error('[MC ERROR]', error);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `ERREUR MC: ${error.message}` }); } catch {}
  });
  launcher.on('close', (code) => {
    console.log(`[MC] Processus terminé avec code: ${code}`);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Processus terminé (code: ${code})` }); } catch {}
  });

  // Lancement du jeu avec gestion d'erreurs améliorée
  console.log(`[Launch] Lancement de Minecraft pour ${serverName}...`);
  try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Lancement de Minecraft...` }); } catch {}
  
  try {
    // Afficher les options complètes pour debug
    console.log(`[Launch] Options complètes:`, JSON.stringify(opts, null, 2));
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Configuration prête...` }); } catch {}
    
    // Lancer avec un timeout pour éviter les blocages infinis
    const launchPromise = launcher.launch(opts);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: Le launcher met trop de temps à démarrer')), 30000);
    });
    
    const child = await Promise.race([launchPromise, timeoutPromise]);
    console.log(`[Launch] Minecraft lancé avec succès! PID: ${child?.pid || 'undefined'}`);
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `✅ Minecraft lancé! (PID: ${child?.pid || 'undefined'})`, progress: 100 }); } catch {}
    
    // Message de succès après 2 secondes
    setTimeout(() => {
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `🎮 Jeu en cours d'exécution! Vous pouvez fermer cette fenêtre.`, progress: 100 }); } catch {}
    }, 2000);
    
    return launcher;
  } catch (error) {
    console.error(`[Launch] Erreur critique lors du lancement:`, error);
    const errorMsg = `ERREUR: ${error.message}`;
    try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: errorMsg, progress: 0 }); } catch {}
    
    // Essayer un lancement de secours sans NeoForge si c'est une erreur NeoForge
    if (isUsingNeoForge && error.message.includes('neoForge')) {
      console.log(`[Launch] Tentative de lancement de secours sans NeoForge...`);
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Tentative de lancement de secours...` }); } catch {}
      
      const fallbackOpts = { ...opts };
      delete fallbackOpts.forge;
      delete fallbackOpts.installerPath;
      fallbackOpts.extraArguments = [];
      
      try {
        const child = launcher.launch(fallbackOpts);
        console.log(`[Launch] Lancement de secours réussi! PID: ${child?.pid}`);
        try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `✅ Lancé en mode vanilla!`, progress: 100 }); } catch {}
        return launcher;
      } catch (fallbackError) {
        console.error(`[Launch] Le lancement de secours a aussi échoué:`, fallbackError);
        throw new Error(`Échec complet: ${error.message} | Secours: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}


module.exports = {
  ensureAll,
  launchMinecraft,
  loginEminium,
  testServerConnection,
  readUserProfile,
  logoutEminium,
  eminiumDir,
  hiddenBase,
  getServerGameDir,
  NEOFORGE_INSTALL_DIR,
  NEOFORGE_INSTALLER_PATH,
  usePreInstalledNeoForge,
  ensureNeoForgeInstaller
};

// Helpers d'état/installation pour le launcher
async function checkReady() {
  try {
    const vDir = path.join(dirs.versions, MC_VERSION);
    const vJsonPath = path.join(vDir, `${MC_VERSION}.json`);
    const vJarPath = path.join(vDir, `${MC_VERSION}.jar`);
    let assetsId = MC_VERSION;
    if (fs.existsSync(vJsonPath)) {
      try {
        const vj = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
        assetsId = vj?.assetIndex?.id || vj?.assets || assetsId;
      } catch {}
    }
    const idxPath = path.join(dirs.assets, 'indexes', `${assetsId}.json`);
    const forgeInstaller = path.join(hiddenBase, 'cache', `forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`);
    
    // Vérifier également le NeoForge préinstallé
    const neoforgeInstalled = fs.existsSync(NEOFORGE_INSTALLER_PATH);
    
    const ok = [vJsonPath, vJarPath, idxPath].every(p => fs.existsSync(p)) && 
              (fs.existsSync(forgeInstaller) || neoforgeInstalled);
    
    return { ok, neoforgeInstalled };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), neoforgeInstalled: false };
  }
}

async function prepareGame(log) {
  // Fast path: if already ready, don't do anything
  try {
    const st = await checkReady();
    if (st && st.ok) {
      log && log('Déjà prêt ✓');
      if (st.neoforgeInstalled) {
        log && log('NeoForge préinstallé détecté ✓');
      }
      return { skipped: true, neoforgeInstalled: st.neoforgeInstalled };
    }
  } catch {}
  
  await ensureAll();
  const logger = (msg) => { log && log(msg); };
  await ensureVersionFilesBMCL(MC_VERSION, logger);
  
  // Vérifier si NeoForge est préinstallé
  const neoforgeInstalled = fs.existsSync(NEOFORGE_INSTALLER_PATH);
  if (neoforgeInstalled) {
    log && log('NeoForge préinstallé disponible ✓');
  } else {
    // Essayer d'installer NeoForge si non trouvé
    try {
      await ensureNeoForgeInstaller(MC_VERSION, NEOFORGE_VERSION);
      log && log('NeoForge installé ✓');
    } catch (e) {
      log && log(`Attention: ${e.message}`);
      log && log('Tentative avec Forge legacy...');
      await ensureForgeInstaller(MC_VERSION, FORGE_VERSION);
    }
  }
  
  return { ok: true, neoforgeInstalled };
}

module.exports.checkReady = checkReady;
module.exports.prepareGame = prepareGame;
