/**
 * Module d'auto-indexation IA pour DocuLens v3.0
 * 
 * REFONTE COMPLÈTE - ARCHITECTURE IMMUABLE :
 * ✅ Aucun renommage physique de fichiers
 * ✅ Stockage des métadonnées IA dans appState uniquement
 * ✅ Utilisation d'ImageDisplayManager pour l'affichage
 * ✅ Mise à jour de l'interface via renderSections()
 */

class AIIndexingManager {
    constructor() {
        this.isProcessing = false;
        this.results = [];
        this.documentName = null;
        this.version = '3.0.0-IMMUTABLE-METADATA';
        
        console.log(`🚀 [AIIndexingManager] v${this.version} - Architecture Immuable initialisée`);
        this.init();
    }
    
    init() {
        this.checkServiceStatus();
    }
    
    /**
     * Vérifie le statut du service d'indexation IA
     */
    async checkServiceStatus() {
        try {
            const response = await fetch('/api/ai-indexing/status');
            const data = await response.json();
            
            this.updateServiceStatus(data);
            return data.available && data.connection;
        } catch (error) {
            console.error('Erreur lors de la vérification du service:', error);
            this.updateServiceStatus({
                available: false,
                connection: false,
                message: 'Erreur de connexion au service'
            });
            return false;
        }
    }
    
    /**
     * Met à jour l'affichage du statut du service
     */
    updateServiceStatus(status) {
        const statusElement = document.getElementById('aiServiceStatus');
        const buttonElement = document.getElementById('aiIndexingBtn');
        
        if (!statusElement || !buttonElement) return;
        
        statusElement.innerHTML = '';
        
        if (status.available && status.connection) {
            statusElement.innerHTML = `
                <div class="ai-status-indicator ai-status-available">
                    <i class="fas fa-check-circle"></i>
                    <span>Service IA disponible</span>
                </div>
            `;
            buttonElement.disabled = false;
        } else if (status.available && !status.connection) {
            statusElement.innerHTML = `
                <div class="ai-status-indicator ai-status-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>Connexion API instable</span>
                </div>
            `;
            buttonElement.disabled = false;
        } else {
            statusElement.innerHTML = `
                <div class="ai-status-indicator ai-status-unavailable">
                    <i class="fas fa-times-circle"></i>
                    <span>Service IA indisponible</span>
                </div>
                <small class="ai-status-message">${status.message}</small>
            `;
            buttonElement.disabled = true;
        }
    }
    
    /**
     * Démarre l'auto-indexation des images sélectionnées
     */
    async startAutoIndexing() {
        if (this.isProcessing) return;
        
        const selectedImages = this.getSelectedImages();
        
        console.log('🔍 Debug sélection d\'images:', {
            selectedCount: selectedImages.length,
            selectedImages: selectedImages
        });
        
        if (selectedImages.length === 0) {
            const totalImages = document.querySelectorAll('.image-card').length;
            const message = totalImages > 0 
                ? `Aucune image sélectionnée. Cliquez sur les images pour les sélectionner (${totalImages} image(s) disponible(s)).`
                : 'Aucune image disponible.';
            
            this.showNotification(message, 'warning');
            return;
        }
        
        // Vérifier le service avant de commencer
        const serviceAvailable = await this.checkServiceStatus();
        if (!serviceAvailable) {
            this.showNotification('Service d\'indexation IA non disponible', 'error');
            return;
        }
        
        this.documentName = appState.documentName;
        
        // Utiliser le système unifié
        if (typeof window.aiIndexingModal !== 'undefined') {
            window.aiIndexingModal.show(selectedImages);
        } else {
            console.error('Modal unifié non disponible, fallback vers ancien système');
            this.showNotification('Erreur d\'interface', 'error');
        }
    }
    
    /**
     * Récupère les images sélectionnées
     */
    getSelectedImages() {
        if (typeof window.selectedImages !== 'undefined' && window.selectedImages instanceof Set) {
            return Array.from(window.selectedImages);
        }
        
        // Fallback : chercher les images avec la classe 'selected'
        const selectedImageCards = document.querySelectorAll('.image-card.selected');
        const selectedImageFilenames = [];
        
        selectedImageCards.forEach(card => {
            const filename = card.dataset.imageFilename;
            if (filename) {
                selectedImageFilenames.push(filename);
            }
        });
        
        return selectedImageFilenames;
    }
    
    /**
     * 🆕 NOUVELLE MÉTHODE : Application des suggestions IA
     * Stocke les métadonnées IA sans renommer les fichiers physiques
     */
    async applyAISuggestions(selectedSuggestions) {
        try {
            console.log('🚀 [AI-Indexing] Application des suggestions IA (métadonnées uniquement)');
            console.log('📋 Suggestions à appliquer:', selectedSuggestions);
            
            if (!window.appState) {
                throw new Error('appState non disponible');
            }
            
            // 🔍 DEBUG COMPLET: Afficher toute la structure appState
            console.log('🧪 [DEBUG] Structure complète appState:');
            console.log('📦 appState:', JSON.stringify(window.appState, null, 2));
            console.log('🔢 Nombre de sections:', window.appState.sections?.length || 0);
            console.log('🔢 Images non-assignées:', window.appState.unassignedImages?.length || 0);
            
            // Appliquer les métadonnées IA dans appState
            const updatedCount = this.updateAppStateWithAIMetadata(selectedSuggestions);
            
            if (updatedCount > 0) {
                // Vider le cache pour forcer la régénération des noms
                if (window.imageDisplayManager) {
                    window.imageDisplayManager.clearNameCache();
                }
                
                // Re-rendre l'interface pour afficher les nouveaux noms IA
                if (typeof renderSections === 'function') {
                    renderSections();
                }

                // Mettre à jour les statistiques
                if (typeof updateStats === 'function') {
                    updateStats();
                }
                
                this.showNotification(
                    `${updatedCount} image(s) indexée(s) avec succès`,
                    'success'
                );
                
                console.log(`✅ [AI-Indexing] ${updatedCount} images mises à jour dans appState`);
                return true;
            } else {
                throw new Error('Aucune image mise à jour');
            }
            
        } catch (error) {
            console.error('❌ [AI-Indexing] Erreur lors de l\'application des suggestions:', error);
            this.showNotification(
                `Erreur lors de l'indexation: ${error.message}`,
                'error'
            );
            return false;
        }
    }
    
    /**
     * 🆕 Met à jour appState avec les métadonnées IA (sans renommage physique)
     */
    updateAppStateWithAIMetadata(suggestions) {
        let updatedCount = 0;
        
        // Appliquer la vérification des doublons côté client
        const uniqueSuggestions = this.ensureUniqueAINames(suggestions);
        
        uniqueSuggestions.forEach(suggestion => {
            const { filename, suggested_name } = suggestion;

            console.log(`🔍 [AI-Indexing] Traitement métadonnées pour: ${filename} -> "${suggested_name}"`);
            
            // Chercher l'image dans les sections
            let imageFound = false;
            
            // 1. Chercher dans les sections assignées
            if (window.appState.sections && Array.isArray(window.appState.sections)) {
                for (const section of window.appState.sections) {
                    const image = section.images.find(img => img.filename === filename);
                    if (image) {
                        image.isAIRenamed = true;
                        image.aiSuggestedName = suggested_name;
                        imageFound = true;
                        updatedCount++;
                        console.log(`  ✅ [AI-Indexing] Image mise à jour dans section: ${filename}`);
                        break;
                    }
                }
            }
            
            // 2. Chercher dans les images non assignées si pas encore trouvée
            if (!imageFound && window.appState.unassignedImages && Array.isArray(window.appState.unassignedImages)) {
                const image = window.appState.unassignedImages.find(img => img.filename === filename);
                if (image) {
                    image.isAIRenamed = true;
                    image.aiSuggestedName = suggested_name;
                    imageFound = true;
                    updatedCount++;
                    console.log(`  ✅ [AI-Indexing] Image mise à jour dans non-assignées: ${filename}`);
                }
            }
            
            if (!imageFound) {
                console.warn(`  ⚠️ [AI-Indexing] Image non trouvée dans appState: ${filename}`);
                
                // Debug: Lister toutes les images disponibles
                console.log('🔍 [DEBUG] Images disponibles dans appState:');
                console.log(`🔢 [DEBUG] window.appState existe:`, !!window.appState);
                console.log(`🔢 [DEBUG] sections existe:`, !!window.appState?.sections);
                console.log(`🔢 [DEBUG] nombre de sections:`, window.appState?.sections?.length || 0);
                console.log(`🔢 [DEBUG] unassignedImages existe:`, !!window.appState?.unassignedImages);
                console.log(`🔢 [DEBUG] nombre unassigned:`, window.appState?.unassignedImages?.length || 0);
                
                if (window.appState?.sections) {
                    window.appState.sections.forEach((section, i) => {
                        console.log(`  Section ${i} (${section.name}): ${section.images?.length || 0} images`);
                        if (section.images) {
                            section.images.forEach(img => {
                                console.log(`    - ${img.filename}`);
                            });
                        }
                    });
                } else {
                    console.log('❌ [DEBUG] Pas de sections dans appState');
                }
                
                if (window.appState?.unassignedImages) {
                    console.log(`  Images non-assignées: ${window.appState.unassignedImages.length}`);
                    window.appState.unassignedImages.forEach(img => {
                        console.log(`    - ${img.filename}`);
                    });
                } else {
                    console.log('❌ [DEBUG] Pas d\'images non-assignées dans appState');
                }
                
                // Debug supplémentaire: structure complète
                console.log('🏗️ [DEBUG] Structure appState complète:');
                console.log(JSON.stringify(window.appState, null, 2));
                }
        });
        
        console.log(`📊 [AI-Indexing] Bilan mise à jour appState: ${updatedCount}/${uniqueSuggestions.length} images mises à jour`);
        return updatedCount;
    }

    /**
     * 🔍 Assure l'unicité des noms IA côté client
     * Vérifie les doublons dans toutes les images déjà indexées
     */
    ensureUniqueAINames(suggestions) {
        console.log('🔍 [AI-Indexing] Vérification unicité des noms IA côté client');
        
        // Récupérer tous les noms IA existants dans appState
        const existingAINames = this.getExistingAINames();
        console.log('📋 Noms IA existants:', existingAINames);
        
        const titleCounts = {};
        
        // Initialiser les compteurs avec les noms existants
        existingAINames.forEach(existingName => {
            const baseName = existingName;
            let numberSuffix = 1;
            
            // Si le nom se termine par " X" où X est un nombre
            const match = existingName.match(/^(.+)\s(\d+)$/);
            if (match) {
                const extractedBaseName = match[1];
                const extractedNumber = parseInt(match[2]);
                
                if (!titleCounts[extractedBaseName] || titleCounts[extractedBaseName] < extractedNumber) {
                    titleCounts[extractedBaseName] = extractedNumber;
                }
            } else {
                // Nom sans numéro
                if (!titleCounts[baseName]) {
                    titleCounts[baseName] = 1;
                }
            }
        });
        
        // Traiter les nouvelles suggestions
        const uniqueSuggestions = suggestions.map(suggestion => {
            const originalName = suggestion.suggested_name.trim();
            
            if (titleCounts[originalName]) {
                titleCounts[originalName]++;
                const uniqueName = `${originalName} ${titleCounts[originalName]}`;
                console.log(`📝 Nom IA rendu unique: "${originalName}" -> "${uniqueName}"`);
                
                return {
                    ...suggestion,
                    suggested_name: uniqueName
                };
            } else {
                titleCounts[originalName] = 1;
                return suggestion;
            }
        });
        
        console.log(`✅ ${uniqueSuggestions.length} noms IA vérifiés pour unicité`);
        return uniqueSuggestions;
    }

    /**
     * 🔍 Récupère tous les noms IA existants dans appState
     */
    getExistingAINames() {
        const existingNames = [];
        
        try {
            if (window.appState && window.appState.sections) {
                window.appState.sections.forEach(section => {
                    if (section.images) {
                        section.images.forEach(image => {
                            if (image.isAIRenamed && image.aiSuggestedName) {
                                existingNames.push(image.aiSuggestedName);
                            }
                        });
                    }
                });
            }
            
            if (window.appState && window.appState.unassignedImages) {
                window.appState.unassignedImages.forEach(image => {
                    if (image.isAIRenamed && image.aiSuggestedName) {
                        existingNames.push(image.aiSuggestedName);
                    }
                });
            }
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des noms IA existants:', error);
        }
        
        return existingNames;
    }
    
    /**
     * 🔄 MÉTHODE DE COMPATIBILITÉ : Applique les renommages (legacy support)
     * Maintenant redirige vers la nouvelle méthode de métadonnées
     */
    async applyRenames(selectedSuggestions) {
        console.log('🔄 [AI-Indexing] applyRenames appelé - redirection vers métadonnées uniquement');
        
        // Transformer le format pour la nouvelle méthode
        const suggestions = selectedSuggestions.map(rename => ({
            filename: rename.original_filename,
            suggested_name: rename.suggested_ia_name
        }));
        
        return this.applyAISuggestions(suggestions);
                }
                
    /**
     * 🔄 MÉTHODE DE COMPATIBILITÉ : updateInterfaceAfterRename (legacy support)
     * Maintenant utilise renderSections() global
     */
    updateInterfaceAfterRename(updatedResults) {
        console.log('🔄 [AI-Indexing] updateInterfaceAfterRename appelé - utilisation de renderSections()');
        
        // Forcer le nettoyage du cache
        if (window.imageDisplayManager) {
            window.imageDisplayManager.clearNameCache();
        }
        
        // Re-rendre complètement l'interface
        if (typeof renderSections === 'function') {
            renderSections();
        }
        
        // Mettre à jour les statistiques
        if (typeof updateStats === 'function') {
            updateStats();
        }
        
        console.log('✅ [AI-Indexing] Interface mise à jour via renderSections()');
    }
    
    /**
     * Affiche une notification
     */
    showNotification(message, type = 'info') {
        const alertClass = {
            'success': 'alert-success',
            'error': 'alert-danger',
            'warning': 'alert-warning',
            'info': 'alert-info'
        }[type] || 'alert-info';
        
        const notification = document.createElement('div');
        notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-supprimer après 5 secondes
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialiser le gestionnaire d'auto-indexation
let aiIndexingManager;

document.addEventListener('DOMContentLoaded', function() {
    aiIndexingManager = new AIIndexingManager();
    window.aiIndexingManager = aiIndexingManager;
});

// Fonction globale pour démarrer l'auto-indexation
function startAIIndexing() {
    if (aiIndexingManager) {
        aiIndexingManager.startAutoIndexing();
    }
} 