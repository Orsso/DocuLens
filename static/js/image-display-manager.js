/**
 * 🚀 IMAGE DISPLAY MANAGER - SYSTÈME UNIFIÉ DE NOMMAGE v3.0
 * 
 * ARCHITECTURE RÉVOLUTIONNAIRE :
 * ✅ Identifiants physiques IMMUABLES (jamais modifiés)
 * ✅ Métadonnées volatiles stockées dans appState
 * ✅ Génération "juste-à-temps" centralisée
 * ✅ Renommage uniquement à l'export ZIP
 * 
 * PRINCIPE FONDAMENTAL : UNE SEULE SOURCE DE VÉRITÉ (appState)
 */
class ImageDisplayManager {
    constructor() {
        this.version = '3.0.0-IMMUTABLE-METADATA';
        this.debugMode = false;
        
        // 📁 Extensions supportées
        this.supportedExtensions = /\.(jpg|jpeg|png|gif|bmp|webp)$/i;

        // 🎯 Cache des noms générés pour optimisation
        this.nameCache = new Map();
        
        console.log(`🚀 [ImageDisplayManager] v${this.version} - Architecture Immuable initialisée`);
    }

    /**
     * 🔄 RESET CACHE
     * Nettoie le cache pour une nouvelle session de rendu
     */
    clearNameCache() {
        this.nameCache.clear();
        this._debug('🗑️ Cache des noms vidé');
    }

    /**
     * 🎯 MÉTHODE CENTRALE UNIQUE
     * Point d'entrée pour TOUS les besoins de nommage
     * 
     * @param {Object} image - Objet image avec filename, isAIRenamed, aiSuggestedName
     * @param {string} context - 'display' | 'export'
     * @param {string} sectionNumber - Numéro de section (pour export)
     * @param {number} imageIndex - Index image dans section (pour export)
     * @returns {string} Nom formaté selon le contexte
     */
    getImageName(image, context = 'display', sectionNumber = null, imageIndex = null) {
        if (!image || !image.filename) {
            this._debug('⚠️ Image invalide ou filename manquant', { image, context });
            return context === 'export' ? this._generateExportFallback(sectionNumber, imageIndex) : '';
        }

        const cacheKey = `${image.filename}-${context}-${sectionNumber}-${imageIndex}`;
        
        // Vérifier le cache d'abord
        if (this.nameCache.has(cacheKey)) {
            const cached = this.nameCache.get(cacheKey);
            this._debug(`📦 Cache hit: ${cacheKey} -> ${cached}`);
            return cached;
        }

        let result;
        switch (context) {
            case 'display':
                result = this._getDisplayName(image);
                break;
            
            case 'export':
                result = this._getExportName(image, sectionNumber, imageIndex);
                break;
            
            default:
                this._debug(`⚠️ Contexte inconnu: ${context}, fallback vers display`);
                result = this._getDisplayName(image);
        }

        // Mettre en cache le résultat
        this.nameCache.set(cacheKey, result);
        
        this._debug(`🔍 getImageName`, {
            filename: image.filename,
            context,
            isAIRenamed: image.isAIRenamed,
            aiSuggestedName: image.aiSuggestedName,
            sectionNumber,
            imageIndex,
            result
        });

        return result;
    }

    /**
     * 📱 GESTION AFFICHAGE INTERFACE
     * NOUVELLE LOGIQUE SIMPLIFIÉE:
     * - Si nom IA: retourne le nom IA pur
     * - Si standard: retourne chaîne vide (pas de nom affiché)
     */
    _getDisplayName(image) {
        // 1. Image avec nom IA suggéré
        if (image.isAIRenamed && image.aiSuggestedName) {
            const cleanName = this._cleanDisplayName(image.aiSuggestedName);
            this._debug(`✅ Nom IA affiché: "${cleanName}"`);
            return cleanName;
        }
        
        // 2. Image standard - pas d'affichage de nom
        this._debug(`✅ Image standard - affichage vide`);
        return '';
    }

    /**
     * 📦 GESTION EXPORT ZIP
     * SEUL ENDROIT où les noms de fichiers sont "matérialisés"
     */
    _getExportName(image, sectionNumber, imageIndex) {
        if (!sectionNumber || !imageIndex || !window.appState) {
            this._debug('⚠️ Paramètres export manquants ou appState non dispo, fallback');
            return this._generateExportFallback(sectionNumber, imageIndex);
        }

        const { prefix, documentName } = window.appState;
        const extension = this._extractExtension(image.filename);

        // Scénario 1: Image renommée par l'IA
        if (image.isAIRenamed && image.aiSuggestedName) {
            const title = this._cleanForExport(image.aiSuggestedName);
            const exportName = `${prefix}-${documentName}-${sectionNumber}-${imageIndex} ${title}.${extension}`;
            this._debug(`✅ Export IA: "${exportName}"`);
            return exportName;
        } 
        
        // Scénario 2: Image standard
        else {
            // Vérifier si l'image est seule dans sa section
            const sectionImages = this._getSectionImageCount(sectionNumber);
            
            if (sectionImages <= 1) {
                // Image seule : pas de numéro Y
                const exportName = `${prefix}-${documentName}-${sectionNumber}.${extension}`;
                this._debug(`✅ Export Standard (seule): "${exportName}"`);
                return exportName;
            } else {
                // Plusieurs images : avec numéro Y
                const exportName = `${prefix}-${documentName}-${sectionNumber}-${imageIndex}.${extension}`;
                this._debug(`✅ Export Standard (multiple): "${exportName}"`);
                return exportName;
            }
        }
    }

    /**
     * 🧹 NETTOYAGE NOM AFFICHAGE
     * Nettoie un nom pour l'affichage dans l'interface
     */
    _cleanDisplayName(name) {
        if (!name) return '';
        
        return name
            .trim()
            .replace(/[<>:"/\\|?*]/g, '')  // Caractères interdits
            .replace(/\s+/g, ' ')          // Espaces multiples
            .slice(0, 50);                 // Limiter longueur
    }

    /**
     * 🧹 NETTOYAGE NOM EXPORT
     * Nettoie un nom pour l'export ZIP
     */
    _cleanForExport(name) {
        if (!name) return 'image';
        
        return name
            .trim()
            .replace(/[<>:"/\\|?*]/g, '_') // Remplacer caractères interdits par _
            .replace(/\s+/g, ' ')          // Espaces multiples
            .slice(0, 50);                 // Limiter longueur
    }

    /**
     * 🔧 EXTRACTION EXTENSION
     */
    _extractExtension(filename) {
        const match = filename.match(this.supportedExtensions);
        return match ? match[1].toLowerCase() : 'jpg';
    }

    /**
     * 🔢 COMPTEUR IMAGES SECTION
     * Compte le nombre d'images dans une section donnée
     */
    _getSectionImageCount(sectionNumber) {
        try {
            if (!window.appState || !window.appState.sections) {
                this._debug('⚠️ appState non disponible pour comptage');
                return 2; // Défaut : considérer qu'il y a plusieurs images pour éviter erreur
            }

            const section = window.appState.sections.find(s => 
                s.nomenclatureNumber === sectionNumber || 
                s.sectionNumber === sectionNumber ||
                s.number === sectionNumber
            );

            const count = section ? section.images.length : 0;
            this._debug(`🔢 Section ${sectionNumber} contient ${count} image(s)`);
            return count;
        } catch (error) {
            this._debug('❌ Erreur comptage images section:', error);
            return 2; // Défaut sécurisé
        }
    }

    /**
     * 🆘 FALLBACK EXPORT
     * Génère un nom d'export basique si les paramètres sont manquants
     */
    _generateExportFallback(sectionNumber, imageIndex) {
        const section = sectionNumber || 'X';
        const index = imageIndex || '1';
        const fallback = `FALLBACK-${section}_n_${index}.jpg`;
        this._debug(`🆘 Fallback export généré: ${fallback}`);
        return fallback;
    }

    /**
     * 🔍 DEBUG
     */
    _debug(message, data = null) {
        if (this.debugMode) {
            if (data) {
                console.log(`🎯 [ImageDisplayManager] ${message}`, data);
            } else {
                console.log(`🎯 [ImageDisplayManager] ${message}`);
            }
        }
    }

    /**
     * 🧪 DIAGNOSTIC SYSTÈME
     * Fonction de diagnostic pour débugger les problèmes
     */
    diagnose() {
        console.group('🔬 [ImageDisplayManager] Diagnostic Système');
        
        const diagnosticData = {
            version: this.version,
            appStateAvailable: !!window.appState,
            prefix: window.appState?.prefix,
            documentName: window.appState?.documentName,
            cacheSize: this.nameCache.size,
            supportedExtensions: this.supportedExtensions.source
        };
        
        console.table(diagnosticData);
        
        if (window.appState) {
            console.log('📊 AppState Sections:', window.appState.sections?.length || 0);
            console.log('📊 AppState Images non-attribuées:', window.appState.unassignedImages?.length || 0);
        }
        
        console.log('💾 Cache actuel:', this.nameCache);
        console.groupEnd();
        
        return diagnosticData;
    }

    /**
     * 🧪 TEST RAPIDE
     * Test un scénario avec une image fictive
     */
    testScenario(scenarioName, testImage, expectedDisplay, expectedExport, sectionNumber = '2.1', imageIndex = 3) {
        console.group(`🧪 Test: ${scenarioName}`);
        
        const displayResult = this.getImageName(testImage, 'display');
        const exportResult = this.getImageName(testImage, 'export', sectionNumber, imageIndex);
        
        console.log(`📱 Display attendu: "${expectedDisplay}" | Obtenu: "${displayResult}" | ✅: ${displayResult === expectedDisplay}`);
        console.log(`📦 Export attendu: "${expectedExport}" | Obtenu: "${exportResult}" | ✅: ${exportResult === expectedExport}`);
        
        console.groupEnd();
        
        return {
            display: { expected: expectedDisplay, actual: displayResult, pass: displayResult === expectedDisplay },
            export: { expected: expectedExport, actual: exportResult, pass: exportResult === expectedExport }
        };
    }
}

// Initialisation globale
window.imageDisplayManager = new ImageDisplayManager(); 