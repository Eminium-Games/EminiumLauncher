const fs = require('fs');
const path = require('path');

// Vérification de l'installation NeoForge complète
function verifyNeoForgeInstallation() {
  console.log('🔍 VERIFICATION DE L\'INSTALLATION NEOFORGE');
  console.log('='.repeat(50));
  
  const requiredFiles = [
    'neoforge/21.4.121/neoforge-1.21.1-21.4.121-installer.jar',
    'neoforge/launch_profile.json',
    'neoforge/settings.json',
    'neoforge/forge.json',
    'neoforge/versions/1.21.1/1.21.1.json',
    'neoforge/assets/indexes/1.21.1.json',
    'neoforge/README.md'
  ];
  
  const requiredDirs = [
    'neoforge',
    'neoforge/21.4.121',
    'neoforge/libraries',
    'neoforge/versions',
    'neoforge/versions/1.21.1',
    'neoforge/assets',
    'neoforge/assets/indexes',
    'neoforge/assets/objects',
    'neoforge/resourcepacks'
  ];
  
  let allGood = true;
  
  // Vérifier les dossiers
  console.log('\n📁 Verification des dossiers:');
  requiredDirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ ${dir}`);
    } else {
      console.log(`❌ ${dir} - MANQUANT`);
      allGood = false;
    }
  });
  
  // Vérifier les fichiers
  console.log('\n📄 Verification des fichiers:');
  requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const size = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`✅ ${file} (${size} MB)`);
    } else {
      console.log(`❌ ${file} - MANQUANT`);
      allGood = false;
    }
  });
  
  // Vérifier le contenu du fichier forge.json
  console.log('\n⚙️  Verification de la configuration:');
  const forgeConfigPath = path.join(__dirname, '..', 'neoforge', 'forge.json');
  if (fs.existsSync(forgeConfigPath)) {
    try {
      const forgeConfig = JSON.parse(fs.readFileSync(forgeConfigPath, 'utf8'));
      if (forgeConfig['1.21.1'] && forgeConfig['1.21.1'].version === '21.4.121') {
        console.log('✅ Configuration NeoForge correcte');
      } else {
        console.log('❌ Configuration NeoForge incorrecte');
        allGood = false;
      }
    } catch (e) {
      console.log('❌ Erreur lecture configuration:', e.message);
      allGood = false;
    }
  }
  
  // Résumé
  console.log('\n' + '='.repeat(50));
  if (allGood) {
    console.log('🎉 INSTALLATION NEOFORGE PARFAITE!');
    console.log('✅ Tous les fichiers sont presents');
    console.log('✅ Configuration valide');
    console.log('✅ Pret pour le lancement du serveur Factions');
  } else {
    console.log('⚠️  PROBLEMES DETECTES');
    console.log('❌ Certains fichiers ou dossiers manquent');
    console.log('❌ Veuillez reexecuter le script d\'installation');
  }
  console.log('='.repeat(50));
  
  return allGood;
}

// Fonction pour obtenir le chemin de l'installateur NeoForge
function getNeoForgeInstallerPath() {
  return path.join(__dirname, '..', 'neoforge', '21.4.121', 'neoforge-1.21.1-21.4.121-installer.jar');
}

// Fonction pour obtenir le chemin de la configuration
function getNeoForgeConfigPath() {
  return path.join(__dirname, '..', 'neoforge');
}

// Exécuter la vérification
if (require.main === module) {
  verifyNeoForgeInstallation();
}

module.exports = {
  verifyNeoForgeInstallation,
  getNeoForgeInstallerPath,
  getNeoForgeConfigPath
};
