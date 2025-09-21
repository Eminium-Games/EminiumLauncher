/**
 * Test script to verify all modules are loaded correctly
 */

// Test function to verify module loading
function testModuleLoading() {
  console.log('🧪 Testing module loading...');
  
  const modules = [
    'window.App',
    'window.AuthManager', 
    'window.Logger',
    'window.OAuthManager',
    'window.ProgressUI',
    'window.SettingsManager',
    'window.UIHelpers',
    'window.UpdaterManager'
  ];
  
  let allLoaded = true;
  const results = [];
  
  modules.forEach(module => {
    try {
      const exists = eval(module) !== undefined;
      results.push({
        module: module,
        status: exists ? '✅ Loaded' : '❌ Missing',
        exists: exists
      });
      
      if (!exists) {
        allLoaded = false;
      }
    } catch (error) {
      results.push({
        module: module,
        status: '❌ Error',
        exists: false,
        error: error.message
      });
      allLoaded = false;
    }
  });
  
  // Log results
  console.log('Module Loading Test Results:');
  console.table(results);
  
  if (allLoaded) {
    console.log('✅ All modules loaded successfully!');
    
    // Test specific functions
    testSpecificFunctions();
  } else {
    console.error('❌ Some modules failed to load');
  }
  
  return allLoaded;
}

// Test specific functions from each module
function testSpecificFunctions() {
  console.log('🧪 Testing specific functions...');
  
  const functionTests = [
    {
      module: 'App',
      tests: ['launchGame', 'checkAndAutoPrepare', 'autoStartFlow']
    },
    {
      module: 'AuthManager',
      tests: ['login', 'logout', 'isLoggedIn', 'showLoginModal']
    },
    {
      module: 'Logger',
      tests: ['log', 'error', 'warn', 'info', 'debug']
    },
    {
      module: 'OAuthManager',
      tests: ['initOAuth', 'connectCroissant', 'disconnectCroissant']
    },
    {
      module: 'ProgressUI',
      tests: ['open', 'close', 'set', 'addLine', 'enableClose']
    },
    {
      module: 'SettingsManager',
      tests: ['loadSettings', 'saveSettings', 'getSettings', 'detectSystemRAM']
    },
    {
      module: 'UIHelpers',
      tests: ['showModal', 'hideModal', 'showNotification', 'setLoading']
    },
    {
      module: 'UpdaterManager',
      tests: ['initUpdaterManager', 'checkForUpdates', 'installUpdateManual', 'getUpdaterState']
    }
  ];
  
  functionTests.forEach(testGroup => {
    console.log(`Testing ${testGroup.module} functions...`);
    
    const moduleObj = window[testGroup.module];
    if (!moduleObj) {
      console.error(`❌ ${testGroup.module} module not found`);
      return;
    }
    
    testGroup.tests.forEach(funcName => {
      const exists = typeof moduleObj[funcName] === 'function';
      console.log(`${exists ? '✅' : '❌'} ${testGroup.module}.${funcName}()`);
    });
  });
}

// Test updater functionality specifically
function testUpdaterFunctionality() {
  console.log('🧪 Testing updater functionality...');
  
  if (!window.UpdaterManager) {
    console.error('❌ UpdaterManager not loaded');
    return false;
  }
  
  try {
    // Test getting updater state
    const state = window.UpdaterManager.getUpdaterState();
    console.log('✅ getUpdaterState() works:', state);
    
    // Test update UI function
    window.UpdaterManager.updateUpdateUI();
    console.log('✅ updateUpdateUI() works');
    
    return true;
  } catch (error) {
    console.error('❌ Updater functionality test failed:', error);
    return false;
  }
}

// Run all tests when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAllTests);
} else {
  runAllTests();
}

function runAllTests() {
  console.log('🚀 Starting module tests...');
  
  setTimeout(() => {
    const modulesLoaded = testModuleLoading();
    
    if (modulesLoaded) {
      const updaterWorks = testUpdaterFunctionality();
      
      if (updaterWorks) {
        console.log('🎉 All tests passed! The application should work correctly.');
      } else {
        console.error('❌ Updater tests failed');
      }
    } else {
      console.error('❌ Module loading tests failed');
    }
  }, 1000); // Wait a bit for modules to initialize
}

// Export test functions for debugging
window.ModuleTests = {
  testModuleLoading,
  testSpecificFunctions,
  testUpdaterFunctionality,
  runAllTests
};
