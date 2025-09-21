# Système de Mise à Jour Amélioré - Eminium Launcher

## Overview

Le système de mise à jour de l'Eminium Launcher a été complètement repensé pour offrir une expérience utilisateur plus robuste, informative et conviviale. Ce nouveau système centralise toutes les fonctionnalités liées aux mises à jour dans un module dédié avec une interface utilisateur améliorée.

## Nouvelles Fonctionnalités

### 1. Updater Manager (`updater-manager.js`)

Un module centralisé qui gère toutes les opérations de mise à jour :

- **Vérification automatique des mises à jour** au démarrage et périodiquement
- **Téléchargement avec progression détaillée** (vitesse, temps restant, fichiers)
- **Installation sécurisée** avec sauvegarde automatique
- **Gestion des erreurs améliorée** avec retry automatique
- **Notifications système** pour les mises à jour disponibles
- **Historique des mises à jour** persistant dans le localStorage
- **Support des mises à jour manuelles et automatiques**

### 2. Interface Utilisateur Améliorée

Nouvelle section "Mises à jour" dans l'onglet Play :

- **Affichage de la version actuelle** et de la dernière vérification
- **Statut en temps réel** des opérations de mise à jour
- **Notifications visuelles** pour les mises à jour disponibles
- **Boutons d'action** pour vérifier et installer les mises à jour
- **Informations détaillées** sur les nouvelles versions (changelog)

### 3. Architecture Modulaire

Le code a été réorganisé en modules séparés pour une meilleure maintenabilité :

- `app.js` - Point d'entrée principal
- `auth-manager.js` - Gestion de l'authentification
- `logger.js` - Système de logging
- `oauth-manager.js` - Gestion OAuth/Croissant
- `progress-ui.js` - Interface de progression
- `settings-manager.js` - Gestion des paramètres
- `ui-helpers.js` - Utilitaires UI
- `updater-manager.js` - **Nouveau gestionnaire de mises à jour**

## Configuration

### Options de Configuration

```javascript
const UPDATE_CONFIG = {
  autoCheckInterval: 30 * 60 * 1000, // 30 minutes
  checkOnStartup: true,
  checkOnNetworkChange: true,
  maxRetries: 3,
  retryDelay: 5000,
  showNotifications: true,
  allowPrerelease: false,
  backupBeforeUpdate: true
};
```

### Personnalisation

Les options peuvent être modifiées dans `updater-manager.js` :

- `autoCheckInterval`: Intervalle de vérification automatique
- `checkOnStartup`: Vérification au démarrage
- `showNotifications`: Afficher les notifications système
- `allowPrerelease`: Autoriser les versions bêta
- `backupBeforeUpdate`: Sauvegarde avant mise à jour

## Utilisation

### Vérification Manuelles

```javascript
// Vérifier les mises à jour manuellement
await window.UpdaterManager.checkForUpdates(true);
```

### Installation Manuelles

```javascript
// Installer une mise à jour disponible
await window.UpdaterManager.installUpdateManual();
```

### Accès à l'État

```javascript
// Obtenir l'état actuel du système de mise à jour
const state = window.UpdaterManager.getUpdaterState();
console.log(state);
/*
{
  checking: false,
  downloading: false,
  installing: false,
  currentVersion: "1.0.0",
  latestVersion: null,
  updateAvailable: false,
  updateInfo: null,
  downloadProgress: 0,
  installProgress: 0,
  lastCheck: "2024-01-15T10:30:00Z",
  autoCheckEnabled: true,
  updateHistory: []
}
*/
```

## Événements

Le système émet plusieurs événements pour suivre le progrès :

### Événements de Progression

- `checking`: Début de la vérification
- `downloading`: Téléchargement en cours
- `installing`: Installation en cours
- `downloaded`: Téléchargement terminé
- `applied`: Mise à jour appliquée
- `error`: Erreur lors de la mise à jour

### Événements Système

- `updateAvailable`: Nouvelle version disponible
- `updateNotAvailable`: Aucune mise à jour
- `updateError`: Erreur de mise à jour

## Gestion des Erreurs

Le système inclut une gestion robuste des erreurs :

- **Retry automatique** jusqu'à 3 tentatives
- **Messages d'erreur détaillés** dans l'interface
- **Logging complet** pour le débogage
- **Récupération automatique** après erreurs réseau

## Sécurité

### Sauvegardes Automatiques

Avant chaque mise à jour, le système crée une sauvegarde :

- Sauvegarde des fichiers de configuration
- Sauvegarde des préférences utilisateur
- Restauration automatique en cas d'échec

### Vérification d'Intégrité

- Vérification des signatures des fichiers
- Validation des sommes de contrôle
- Protection contre les corruptions

## Performance

### Optimisations

- **Téléchargement parallèle** des fichiers
- **Compression** pour réduire la bande passante
- **Mise en cache** des vérifications
- **Progression en temps réel** avec calculs précis

### Surveillance

- **Vitesse de téléchargement** en temps réel
- **Temps restant estimé**
- **Utilisation réseau** optimisée
- **Gestion de la mémoire** efficace

## Tests

### Script de Test

Un script de test (`test-modules.js`) est inclus pour vérifier :

- Chargement correct de tous les modules
- Fonctionnalités de base du système de mise à jour
- Intégration avec l'interface utilisateur

Pour exécuter les tests :

1. Ouvrir la console du navigateur (F12)
2. Les tests s'exécutent automatiquement au chargement
3. Vérifier les résultats dans la console

### Vérification Manuelles

```javascript
// Exécuter tous les tests
window.ModuleTests.runAllTests();

// Tester uniquement le chargement des modules
window.ModuleTests.testModuleLoading();

// Tester uniquement les fonctionnalités du updater
window.ModuleTests.testUpdaterFunctionality();
```

## Dépannage

### Problèmes Courants

1. **Le système de mise à jour ne se charge pas**
   - Vérifier que `updater-manager.js` est bien inclus dans `index.html`
   - Vérifier la console pour les erreurs JavaScript

2. **Les mises à jour ne sont pas détectées**
   - Vérifier la connexion réseau
   - Vérifier que le serveur de mise à jour est accessible
   - Consulter les logs dans la console

3. **L'installation échoue**
   - Vérifier les permissions d'écriture
   - Vérifier l'espace disque disponible
   - Consulter les logs d'erreur détaillés

### Logs

Le système génère des logs détaillés :

```javascript
// Logs du système de mise à jour
[Updater] Initializing updater manager...
[Updater] Current version: 1.0.0
[Updater] Checking for updates...
[Updater] Update available: { version: "1.1.0", ... }
[Updater] Downloading update: 45% (2.3 MB/s, ETA: 0:45)
[Updater] Update applied successfully
```

## Développement

### Structure des Fichiers

```
src/renderer/
├── updater-manager.js      # Gestionnaire de mise à jour principal
├── app.js                 # Point d'entrée de l'application
├── index.html             # Interface utilisateur
├── test-modules.js        # Script de test (temporaire)
└── README-UPDATER.md      # Documentation (ce fichier)
```

### Extension du Système

Pour ajouter de nouvelles fonctionnalités :

1. Modifier `UPDATE_CONFIG` dans `updater-manager.js`
2. Ajouter les nouvelles fonctions dans le module
3. Mettre à jour l'interface utilisateur dans `index.html`
4. Ajouter les gestionnaires d'événements dans `app.js`
5. Tester avec `test-modules.js`

## Conclusion

Ce nouveau système de mise à jour offre une expérience utilisateur considérablement améliorée avec :

- **Fiabilité accrue** grâce à la gestion d'erreurs robuste
- **Transparence totale** avec une progression détaillée
- **Automatisation intelligente** avec vérifications périodiques
- **Interface moderne** et intuitive
- **Architecture propre** et maintenable

Le système est prêt pour la production et peut être facilement étendu pour répondre aux besoins futurs.
