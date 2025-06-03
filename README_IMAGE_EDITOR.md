# 📝 Éditeur d'Images DocuLens

## 🎯 Vue d'ensemble

L'éditeur d'images intégré permet d'annoter et d'éditer les images extraites des PDFs directement dans l'interface DocuLens. Optimisé pour la documentation technique, il offre des outils spécialisés pour l'ajout de formes et de texte.

## ✨ Fonctionnalités

### 🎨 Outils de Dessin
- **Sélection** : Déplacer et redimensionner les éléments
- **Rectangle** : Dessiner des boîtes pour encadrer du contenu
- **Cercle** : Créer des cercles et ellipses
- **Flèche** : Pointer vers des éléments spécifiques
- **Ligne** : Tracer des lignes droites
- **Texte** : Ajouter du texte stylisé
- **Stylo** : Dessin libre à main levée

### 🎨 Personnalisation
- **Palette de couleurs** : 7 couleurs prédéfinies + sélecteur personnalisé
- **Épaisseur du trait** : Ajustable de 1 à 20 pixels
- **Styles de trait** : Continu, pointillés, points
- **Opacité** : Réglable de 10% à 100%
- **Polices** : Arial, Helvetica, Times New Roman, Courier New
- **Style de texte** : Gras, italique, souligné

### 🔧 Fonctionnalités Avancées
- **Historique** : Annuler/Refaire (50 étapes)
- **Calques** : Gestion des éléments par couches
- **Zoom** : Contrôles de zoom intégrés
- **Responsive** : Interface adaptative mobile/desktop

## 🏗️ Architecture

### Structure Modulaire
```
static/
├── css/
│   └── image-editor.css     # Styles de l'éditeur
└── js/
    └── image-editor.js      # Logique JavaScript

templates/
└── partials/
    └── image-editor-modal.html  # Interface HTML
```

### Technologies Utilisées
- **Frontend** : Fabric.js (Canvas HTML5)
- **Backend** : Flask + base64 encoding
- **UI** : Bootstrap 5 + Glass morphism design
- **Icons** : Font Awesome

## 🚀 Utilisation

### Accès à l'Éditeur
1. Uploadez et traitez un PDF dans DocuLens
2. Sur une image, cliquez sur le bouton violet **"Éditer"** (icône crayon)
3. L'éditeur s'ouvre en plein écran

### Interface de l'Éditeur

#### Barre d'Outils
- **Gauche** : Titre et nom de l'image
- **Centre** : Outils de dessin et couleurs
- **Droite** : Actions (Annuler/Sauvegarder)

#### Sidebar
- **Propriétés** : Épaisseur, style, opacité
- **Texte** : Police, taille, style (visible en mode texte)
- **Calques** : Gestion des éléments

#### Zone de Canvas
- **Centre** : Canvas d'édition avec l'image
- **Coin inférieur droit** : Contrôles de zoom

### Workflow Typique
1. **Sélectionnez un outil** (rectangle, flèche, texte, etc.)
2. **Choisissez une couleur** dans la palette
3. **Ajustez les propriétés** (épaisseur, opacité)
4. **Dessinez** sur l'image
5. **Sauvegardez** vos modifications

## ⚙️ Intégration

### Bouton d'Édition
Le bouton d'édition apparaît au survol de chaque image :
- **Position** : Coin supérieur droit
- **Couleur** : Violet (cohérent avec le design)
- **Action** : Ouvre l'éditeur pour l'image sélectionnée

### Sauvegarde
- L'image originale est automatiquement sauvegardée comme `*_original.ext`
- L'image éditée remplace l'original dans l'interface
- Format de sauvegarde : PNG haute qualité

### API Backend
```http
POST /api/save-edited-image
Content-Type: application/json

{
  "original_filename": "image.jpg",
  "document_name": "mon_document",
  "edited_image_data": "data:image/png;base64,..."
}
```

## 📱 Responsive Design

### Desktop (> 768px)
- Sidebar visible par défaut
- Tous les outils accessibles
- Interface optimale

### Tablet (576px - 768px)
- Sidebar rétrécie (250px)
- Toolbar adaptatif
- Fonctionnalités préservées

### Mobile (< 576px)
- Sidebar rétractable (coulissante)
- Toolbar vertical
- Zoom tactile

## 🎯 Optimisations

### Performance
- **Lazy Loading** : Fabric.js chargé à la demande
- **Canvas Optimisé** : Rendu haute performance
- **Historique Limité** : 50 étapes maximum
- **Gestion Mémoire** : Nettoyage automatique

### UX/UI
- **Glass Morphism** : Design moderne cohérent
- **Animations** : Transitions fluides
- **Tooltips** : Aide contextuelle
- **Raccourcis Clavier** : Navigation rapide

## 🔧 Maintenance

### Logs et Debug
```javascript
// Activer les logs détaillés
window.imageEditor.debugMode = true;
```

### Extensions Futures
- Support des calques avancés
- Filtres d'image
- Formes personnalisées
- Collaboration temps réel
- Export en formats multiples

## 📄 Compatibilité

### Navigateurs Supportés
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

### Formats d'Images
- ✅ JPEG/JPG
- ✅ PNG
- ✅ Canvas export en PNG

## 🤝 Contribution

Pour étendre l'éditeur :

1. **Nouveaux Outils** : Ajoutez dans `ImageEditor.createShape()`
2. **Nouvelles Propriétés** : Étendez la sidebar
3. **Nouveaux Formats** : Modifiez la sauvegarde backend

### Structure du Code
- **Classes ES6** : Code organisé et maintenable
- **Événements** : Gestion propre des interactions
- **Modularité** : Séparation des responsabilités

---

**🎨 L'éditeur d'images DocuLens : Annoter la documentation technique n'a jamais été aussi simple !** 