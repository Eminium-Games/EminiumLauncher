const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 INSTALLATION COMPLÈTE NEOFORGE - EMINIUM LAUNCHER');
console.log('='.repeat(60));

// Obtenir le répertoire racine du launcher
const launcherRoot = path.join(__dirname, '..');

try {
  // Étape 1: Installation
  console.log('\n📦 ÉTAPE 1: Installation des fichiers NeoForge...');
  execSync('node scripts/install-neoforge.js', { stdio: 'inherit', cwd: launcherRoot });
  
  // Étape 2: Vérification  
  console.log('\n🔍 ÉTAPE 2: Vérification de l\'installation...');
  execSync('node scripts/verify-neoforge.js', { stdio: 'inherit', cwd: launcherRoot });
  
  // Étape 3: Test
  console.log('\n🧪 ÉTAPE 3: Test de l\'installation...');
  execSync('node scripts/test-simple.js', { stdio: 'inherit', cwd: launcherRoot });
  
  // Créer un fichier de marqueur pour indiquer que l'installation est complète
  const markerFile = path.join(launcherRoot, 'neoforge', '.installation-complete');
  fs.writeFileSync(markerFile, JSON.stringify({
    installed: true,
    version: '21.4.121',
    minecraft: '1.21.1',
    date: new Date().toISOString(),
    launcher: 'Eminium'
  }, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 INSTALLATION NEOFORGE TERMINÉE AVEC SUCCÈS!');
  console.log('✅ Tous les fichiers sont créés');
  console.log('✅ Configuration validée');
  console.log('✅ Tests réussis');
  console.log('✅ Launcher prêt pour le serveur Factions');
  console.log('\n📋 RÉCAPITULATIF:');
  console.log('   • NeoForge 21.4.121 préinstallé');
  console.log('   • Minecraft 1.21.1 configuré');
  console.log('   • Serveur Factions optimisé');
  console.log('   • Plus aucun téléchargement nécessaire');
  console.log('\n🎮 Le launcher peut maintenant être lancé!');
  console.log('='.repeat(60));
  
} catch (error) {
  console.error('\n❌ ERREUR LORS DE L\'INSTALLATION:', error.message);
  console.log('💡 Vérifiez que vous avez les droits d\'écriture dans le dossier');
  process.exit(1);
}
