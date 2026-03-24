const { usePreInstalledNeoForge } = require('../src/setup.js');

async function testNeoForgeIntegration() {
  console.log('🧪 TEST D\'INTEGRATION NEOFORGE');
  console.log('='.repeat(50));
  
  try {
    // Test de la fonction du launcher
    const installerPath = await usePreInstalledNeoForge('1.21.1', '21.4.121');
    
    if (installerPath) {
      console.log('✅ Succès: Installateur NeoForge trouvé');
      console.log(`📍 Chemin: ${installerPath}`);
      console.log('🎯 Le launcher utilisera ce fichier pour le serveur Factions');
    } else {
      console.log('❌ Erreur: Installateur NeoForge non trouvé');
      console.log('💡 Solution: Exécutez node scripts\\install-neoforge.js');
    }
    
    console.log('='.repeat(50));
    console.log('🏁 TEST TERMINÉ');
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
  }
}

testNeoForgeIntegration();
