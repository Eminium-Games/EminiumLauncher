const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigManager {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config.yml');
    this.defaultConfig = {
      window: {
        width: 1280,
        height: 800,
        x: undefined,
        y: undefined
      },
      game: {
        javaPath: '',
        jvmArgs: '-Xmx2G -Xms1G',
        gameDir: path.join(process.env.APPDATA, '.minecraft'),
        launcherVisibility: 'hide' // ou 'close' ou 'keep'
      },
      settings: {
        autoConnect: false,
        keepLauncherOpen: true,
        showConsole: false,
        language: 'fr_FR'
      }
    };
    this.config = { ...this.defaultConfig };
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        this.config = yaml.load(fileContent) || this.defaultConfig;
      } else {
        this.save(); // Crée le fichier avec la config par défaut
      }
      return this.config;
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
      return this.defaultConfig;
    }
  }

  save() {
    try {
      const yamlStr = yaml.dump(this.config, { lineWidth: -1 });
      fs.writeFileSync(this.configPath, yamlStr, 'utf8');
      return true;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la configuration:', error);
      return false;
    }
  }

  get(key) {
    return key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), this.config);
  }

  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const lastObj = keys.reduce((obj, k) => (obj[k] = obj[k] || {}), this.config);
    lastObj[lastKey] = value;
    return this.save();
  }
}

module.exports = new ConfigManager();
