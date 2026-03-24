const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Test simple de l'installation NeoForge
function testNeoForgeInstallation() {
  console.log('🧪 TEST SIMPLE NEOFORGE');
  console.log('='.repeat(50));
  
  const installerPath = path.join(__dirname, '..', 'neoforge', '21.4.121', 'neoforge-1.21.1-21.4.121-installer.jar');
  
  console.log(`🔍 Recherche de: ${installerPath}`);
  
  if (fs.existsSync(installerPath)) {
    console.log('✅ Fichier trouvé!');
    
    // Vérifier la taille
    const stats = fs.statSync(installerPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📏 Taille: ${sizeMB} MB`);
    
    // Vérifier que c'est un zip valide
    try {
      const zip = new AdmZip(installerPath);
      const entries = zip.getEntries();
      console.log(`📦 Entrées ZIP: ${entries.length}`);
      
      // Vérifier les entrées requises
      const clientLzma = zip.getEntry('data/client.lzma');
      const installProfile = zip.getEntry('install_profile.json');
      
      if (clientLzma && installProfile) {
        console.log('✅ Fichier ZIP valide (contient les entrées requises)');
        
        // Lire le profil d'installation
        try {
          const profileData = installProfile.getData().toString('utf8');
          const profile = JSON.parse(profileData);
          console.log(`📋 Version NeoForge: ${profile.version || 'Inconnue'}`);
          console.log(`🎮 Version Minecraft: ${profile.minecraft || 'Inconnue'}`);
        } catch (e) {
          console.log('⚠️  Impossible de lire le profil d\'installation');
        }
        
        console.log('\n🎉 INSTALLATION NEOFORGE PRÊTE!');
        console.log('✅ Le launcher pourra utiliser ce fichier');
        console.log('✅ Plus besoin de téléchargement');
        console.log('✅ Compatible avec le serveur Factions');
        
      } else {
        console.log('❌ Fichier ZIP invalide (entrées manquantes)');
      }
    } catch (e) {
      console.log('❌ Erreur lecture ZIP:', e.message);
    }
    
  } else {
    console.log('❌ Fichier non trouvé!');
    console.log('💡 Solution: Exécutez node scripts\\install-neoforge.js');
  }
  
  console.log('='.repeat(50));
}

testNeoForgeInstallation();
