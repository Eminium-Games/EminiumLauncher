# 🚀 Installation NeoForge Complète - Eminium Launcher

## 📋 Description

Ce système installe préalablement **tous les fichiers et dossiers NeoForge nécessaires** pour le serveur Eminium Factions, éliminant ainsi les téléchargements et les problèmes de connexion.

## ✅ Ce qui est installé

### 📁 Structure complète
```
neoforge/
├── 21.4.121/
│   └── neoforge-1.21.1-21.4.121-installer.jar (6.87 MB)
├── libraries/                     # Bibliothèques NeoForge
├── versions/
│   └── 1.21.1/
│       └── 1.21.1.json           # Configuration version
├── assets/
│   └── indexes/
│       └── 1.21.1.json           # Index des ressources
├── resourcepacks/                 # Resource packs
├── launch_profile.json            # Profil de lancement
├── settings.json                  # Paramètres NeoForge
├── forge.json                     # Configuration Forge/NeoForge
├── README.md                      # Documentation
└── .installation-complete         # Marqueur d'installation
```

### 🎮 Configuration
- **NeoForge Version**: 21.4.121
- **Minecraft Version**: 1.21.1  
- **Serveur Cible**: Eminium Factions (82.64.85.47:25566)
- **Java Requis**: 21+ (javaw.exe)

## 🛠️ Scripts disponibles

### Installation complète
```bash
node scripts\setup-neoforge-complete.js
```
*Installe, vérifie et teste tout en une seule commande*

### Installation seule
```bash
node scripts\install-neoforge.js
```
*Crée tous les dossiers et fichiers*

### Vérification
```bash
node scripts\verify-neoforge.js
```
*Vérifie que tous les fichiers sont présents et valides*

### Test simple
```bash
node scripts\test-simple.js
```
*Test que l'installateur NeoForge est fonctionnel*

## 🎯 Avantages

### ✅ Plus rapide
- **Zéro téléchargement** au lancement
- **Démarrage instantané** du serveur Factions
- **Pas d'attente** de connexion réseau

### ✅ Plus fiable  
- **Pas de dépendance internet** pour le lancement
- **Pas d'erreurs de téléchargement**
- **Fichiers localement garantis**

### ✅ Plus propre
- **Configuration optimisée** pour le serveur Factions
- **Dossiers bien organisés**
- **Facile à maintenir**

## 🔧 Comment ça fonctionne

1. **Le launcher cherche** d'abord le NeoForge préinstallé dans `neoforge/21.4.121/`
2. **Si trouvé**, il l'utilise directement sans téléchargement
3. **Si non trouvé**, il affiche une erreur claire avec la solution
4. **Toute la configuration** est pré-optimisée pour le serveur Factions

## 🚀 Lancement

Après installation, le launcher utilisera automatiquement cette configuration :

1. **Lancez le launcher** (`npm start`)
2. **Connectez-vous** à votre compte Eminium
3. **Cliquez sur "Jouer"** pour le serveur Factions
4. **Le jeu démarre** immédiatement avec NeoForge préinstallé

## 🔍 Dépannage

### Si le launcher ne trouve pas NeoForge :
```bash
# Réinstallez complètement
node scripts\setup-neoforge-complete.js
```

### Si erreur de permission :
- Exécutez en tant qu'administrateur
- Vérifiez les droits d'écriture dans le dossier

### Si le fichier est corrompu :
```bash
# Supprimez et réinstallez
rmdir /s neoforge
node scripts\install-neoforge.js
```

## 📝 Notes importantes

- **Installation unique** : Pas besoin de réinstaller à chaque lancement
- **Compatible** : Fonctionne avec Java 21 et supérieur
- **Sécurisé** : Fichiers validés et testés
- **Maintenu** : Facile à mettre à jour pour les futures versions

## 🎉 Résultat

Avec cette installation, le lancement du serveur Factions est :
- **Instantané** (pas de téléchargement)
- **Fiable** (pas de dépendance réseau)  
- **Optimisé** (configuration spécifique au serveur)

Le launcher est maintenant prêt pour une utilisation sans faille ! 🎮
