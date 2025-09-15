const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const http = require('http');
const https = require('https');
const AdmZip = require('adm-zip');
const crypto = require('crypto');           // pour générer un UUID offline si besoin
const { execFileSync, spawnSync } = require('child_process');
const SITE_URL = 'https://eminium.ovh';     // ton site Azuriom
const { app, BrowserWindow } = require('electron');



// ── Editable constants
const MC_VERSION = '1.20.1';
const FORGE_VERSION = '47.3.0';
// Emplacement de stockage "invisible" pour Forge+mods
// userData est déjà une zone app spécifique (ex: %AppData%/Eminium Launcher)
const appDataRoot = path.join(process.cwd(), '..'); // fallback when packaged
const hiddenCore = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'core');
const bundledModpack = path.join(hiddenCore, 'modpack.zip');
// Modpack distant (fourni par l'utilisateur)
const MODPACK_URL = 'https://github.com/Fourty3000/get-zip-for-eminium-launcher/archive/refs/tags/ZIP.zip';

// Dossier .eminium (options utilisateur visibles) -> sous AppData (roaming)
const userHome = os.homedir();
const eminiumDir = path.join(app.getPath('appData'), '.eminium');

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

// Client Axios keep-alive pour accélérer les téléchargements
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
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

const { Client, Authenticator } = require('minecraft-launcher-core');

async function launchMinecraft({ memoryMB = 2048, serverHost = 'play.eminium.ovh', serverPort = 25565 } = {}) {

  const profile = readUserProfile();
  if (!profile) {
    throw new Error('Aucun profil utilisateur trouvé. Connectez-vous d’abord.');
  }

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
  // Synchroniser le modpack distant avant tout
  await syncModpackFromUrl(MODPACK_URL, (m) => console.log(m));
  await ensureVersionFilesBMCL(MC_VERSION, log);

  const installerPath = await ensureForgeInstaller(MC_VERSION, FORGE_VERSION);
  // Validate installer again defensively (may have been corrupted externally)
  try {
    const testZip = new AdmZip(installerPath);
    if (!testZip.getEntry('data/client.lzma') || !testZip.getEntry('install_profile.json')) {
      try { fs.unlinkSync(installerPath); } catch {}
      await ensureForgeInstaller(MC_VERSION, FORGE_VERSION);
    }
  } catch {
    try { fs.unlinkSync(installerPath); } catch {}
    await ensureForgeInstaller(MC_VERSION, FORGE_VERSION);
  }
  let javaPath = resolveJavaPath();
  // Enforce bundled JRE so we don't rely on system Java silently
  if (!javaPath) {
    throw new Error('JRE embarqué introuvable. Placez une JRE Java 17 dans assets/core/jre/win/bin/javaw.exe (ou mac/linux selon la plateforme).');
  }
  // Validate Java by running -version; if javaw fails, try sibling java.exe
  const tryCheck = (exePath) => {
    try {
      const { loginEminium, testServerConnection } = require('./setup.js');
      const res = spawnSync(exePath, ['-version'], { encoding: 'utf8', windowsHide: true });
      // Some Javas print version to stderr; accept exitCode 0
      if (res.error) throw res.error;
      if (res.status !== 0) {
        const out = [res.stdout || '', res.stderr || ''].join('\n').trim();
        const msg = `exitCode=${res.status}${out ? `, output=\n${out}` : ''}`;
        throw new Error(msg);
      }
      return true;
    } catch (err) {
      throw err;
    }
  };

  try {
    // If path points to javaw.exe, prefer java.exe for checks
    if (process.platform === 'win32' && javaPath.toLowerCase().endsWith('javaw.exe')) {
      const alt = path.join(path.dirname(javaPath), 'java.exe');
      if (fs.existsSync(alt)) {
        tryCheck(alt);
        javaPath = alt;
      } else {
        tryCheck(javaPath);
      }
    } else {
      tryCheck(javaPath);
    }
  } catch (e2) {
    throw new Error(`Java invalide ou non exécutable: ${javaPath}. Détail: ${e2?.message || e2}`);
  }
  // Preflight: ensure critical Mojang library exists to avoid ForgeWrapper concurrent download issues
  try {
    const pathPart = 'com/mojang/blocklist/1.0.10/blocklist-1.0.10.jar';
    const dest = path.join(dirs.libraries, pathPart.replace(/\//g, path.sep));
    if (!fs.existsSync(dest) || (function(){ try { const st = fs.statSync(dest); return st.size < 1024; } catch { return true; } })()) {
      ensureDir(path.dirname(dest));
      await fetchWithFallback(BMCL.maven(pathPart), dest, 'mojang blocklist jar', true);
      try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: '[BMCL] Librairie pré-téléchargée com/mojang/blocklist' }); } catch {}
    }
  } catch (e) {
    // Non bloquant: ForgeWrapper essaiera aussi, mais on log l'erreur
    try { console.warn('[BMCL] Pré-téléchargement blocklist échoué:', e?.message || String(e)); } catch {}
  }
  try { if (globalThis.emitPlayProgress) globalThis.emitPlayProgress({ line: `Java utilisé: ${javaPath}` }); } catch {}

  const opts = {
    root: hiddenBase, // dossier "invisible" avec Forge et mods
    version: {
      number: MC_VERSION,
      type: 'release'
    },
    forge: installerPath,
    ...(javaPath ? { javaPath } : {}),
    // Use QuickPlay to auto-join the server (avoids deprecated server/port flags)
    quickPlay: {
      type: 'multiplayer',
      identifier: `${serverHost}:${serverPort}`
    },
    memory: {
      max: `${memoryMB}M`,
      min: '512M'
    },
    authorization: auth
  };

  // Cleanup pass: remove any corrupted jars in libraries to force re-download by ForgeWrapper
  await cleanupCorruptLibraries();

  launcher.launch(opts);

  launcher.on('debug', (e) => console.log('[MC DEBUG]', e));
  launcher.on('data', (e) => console.log('[MC]', e.toString()));

  return launcher;
}


module.exports = {
  ensureAll,
  launchMinecraft,
  loginEminium,
  testServerConnection,
  readUserProfile,
  logoutEminium,
  eminiumDir,
  hiddenBase
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
        const vj = JSON.parse(fs.readFileSync(vJsonPath, 'utf-8'));
        assetsId = vj?.assetIndex?.id || vj?.assets || assetsId;
      } catch {}
    }
    const idxPath = path.join(dirs.assets, 'indexes', `${assetsId}.json`);
    const forgeInstaller = path.join(hiddenBase, 'cache', `forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`);
    const ok = [vJsonPath, vJarPath, idxPath, forgeInstaller].every(p => fs.existsSync(p));
    return { ok };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function prepareGame(log) {
  // Fast path: if already ready, don't do anything
  try {
    const st = await checkReady();
    if (st && st.ok) {
      log && log('Déjà prêt ✓');
      return { skipped: true };
    }
  } catch {}
  await ensureAll();
  const logger = (msg) => { log && log(msg); };
  await ensureVersionFilesBMCL(MC_VERSION, logger);
  await ensureForgeInstaller(MC_VERSION, FORGE_VERSION);
  return { ok: true };
}

module.exports.checkReady = checkReady;
module.exports.prepareGame = prepareGame;

// Parcours récursif des JARs pour supprimer ceux corrompus
async function cleanupCorruptLibraries() {
  const base = dirs.libraries;
  const bad = [];
  const isJar = (f) => f.toLowerCase().endsWith('.jar');
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && isJar(e.name)) {
        try {
          const st = fs.statSync(p);
          if (st.size < 1024) { bad.push(p); continue; }
          const zip = new AdmZip(p);
          const entries = zip.getEntries();
          if (!entries || entries.length === 0) bad.push(p);
        } catch { bad.push(p); }
      }
    }
  };
  try { if (fs.existsSync(base)) walk(base); } catch {}
  for (const f of bad) {
    try { fs.unlinkSync(f); } catch {}
  }
  if (bad.length && globalThis.emitPlayProgress) {
    try { globalThis.emitPlayProgress({ line: `[BMCL] Nettoyage: ${bad.length} jar(s) corrompus supprimés (re-téléchargement automatique).` }); } catch {}
  }
}
