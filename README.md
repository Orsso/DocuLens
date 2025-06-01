# DocuLens

**📄 Extraction et organisation intelligente d'images PDF avec interface d'édition avancée**

DocuLens est une application web moderne qui permet d'extraire automatiquement les images d'un document PDF, de les organiser en sections hiérarchiques et de les exporter avec une nomenclature personnalisée.

## ✨ Fonctionnalités

### 🎯 Extraction intelligente
- **Détection automatique** des sections dans le PDF
- **Extraction d'images** haute qualité avec préservation des métadonnées
- **Reconnaissance de hiérarchie** (sections, sous-sections, sous-sous-sections)

### 🎨 Interface d'édition moderne
- **Design glassmorphism** avec interface responsive
- **Drag & drop** intuitif pour réorganiser les images
- **Sélection multiple** avec feedback visuel
- **Aperçu d'images** en modal

### 📂 Gestion des sections
- **Hiérarchie à 3 niveaux** (sections principales, sous-sections, sous-sous-sections)
- **Nomenclature personnalisable** pour chaque section
- **Réorganisation** par glisser-déposer
- **Icônes distinctives** par niveau hiérarchique

### 📦 Export avancé
- **Export ZIP** avec nomenclature personnalisée
- **Formats multiples** (JPEG, PNG)
- **Préfixes configurables**
- **Conservation de l'ordre** défini par l'utilisateur

### 🛠️ Outils de diagnostic
- **Système de logs** intégré dans l'interface
- **Modal de debug** avec diagnostic complet
- **Synchronisation DOM** automatique
- **Détection d'incohérences**

## 🚀 Installation

### Prérequis
- Python 3.8+
- pip
- Git

### Installation rapide

```bash
# Cloner le repository
git clone https://github.com/[votre-username]/DocuLens.git
cd DocuLens

# Créer l'environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows

# Installer les dépendances
pip install -r requirements.txt
```

## 🏃 Utilisation

### Démarrage de l'application

```bash
python app.py
```

L'application sera accessible à l'adresse : `http://localhost:5000`

### Workflow standard

1. **📤 Upload du PDF** sur la page d'accueil
2. **⚡ Traitement automatique** avec détection des sections
3. **✏️ Édition des sections** dans l'interface avancée :
   - Réorganiser les images par drag & drop
   - Modifier la nomenclature des sections
   - Ajouter/supprimer des sections
   - Sélectionner et déplacer plusieurs images
4. **📦 Export ZIP** avec la nomenclature souhaitée

## 🏗️ Architecture technique

### Backend
- **Flask** : Framework web Python
- **PyMuPDF** : Extraction d'images PDF
- **PIL/Pillow** : Traitement d'images
- **Regex** : Détection de sections

### Frontend
- **Bootstrap 5** : Framework CSS
- **SortableJS** : Drag & drop avancé
- **FontAwesome** : Icônes
- **CSS moderne** : Glassmorphism, animations fluides

### Structure des fichiers

```
DocuLens/
├── app.py                 # Application Flask principale
├── templates/
│   ├── index.html        # Page d'accueil
│   └── results.html      # Interface d'édition
├── uploads/              # Dossier des PDF uploadés
├── extracted_images/     # Images extraites (temporaire)
├── requirements.txt      # Dépendances Python
└── .gitignore           # Fichiers à ignorer
```

## 🎨 Fonctionnalités avancées

### Interface d'édition
- **Sections hiérarchiques** avec codes couleur
- **Feedback visuel** pour la sélection multiple
- **Tooltips informatifs** sur tous les éléments
- **Modal de diagnostic** pour le troubleshooting

### Système de nomenclature
- **Préfixe personnalisable** (ex: "CLR", "PROC")
- **Numérotation automatique** des sections
- **Nomenclature sur-mesure** par section (ex: "ANNEXE-A")
- **Génération dynamique** des noms de fichiers

### Gestion d'erreurs
- **Logs en temps réel** dans l'interface
- **Diagnostic automatique** des incohérences
- **Synchronisation DOM** pour la stabilité
- **Messages d'erreur explicites**

## 🔧 Configuration

### Variables d'environnement (optionnel)
```bash
export FLASK_ENV=development    # Mode développement
export FLASK_DEBUG=1           # Debug activé
```

### Personnalisation
- Modifier les **couleurs** dans `templates/results.html` (variables CSS)
- Ajuster les **patterns de détection** dans `app.py`
- Personnaliser les **formats d'export** dans la configuration

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de :

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Distribué sous licence MIT. Voir `LICENSE` pour plus d'informations.

## 🙏 Remerciements

- **PyMuPDF** pour l'extraction PDF robuste
- **SortableJS** pour le drag & drop fluide
- **Bootstrap** pour le framework CSS moderne
- **FontAwesome** pour les icônes élégantes

---

<div align="center">
  <strong>Développé avec ❤️ pour simplifier l'extraction et l'organisation d'images PDF</strong>
</div> 