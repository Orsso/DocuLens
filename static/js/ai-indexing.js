/**
 * Module d'auto-indexation IA pour DocuLens
 * Gère l'interface et les appels API pour l'indexation automatique des images
 */

class AIIndexingManager {
    constructor() {
        this.isProcessing = false;
        this.modal = null;
        this.results = [];
        this.documentName = null;
        
        this.init();
    }
    
    init() {
        this.createModal();
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
     * Crée le modal d'auto-indexation
     */
    createModal() {
        const modalHTML = `
            <div class="modal fade" id="aiIndexingModal" tabindex="-1" aria-labelledby="aiIndexingModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title text-white" id="aiIndexingModalLabel">
                                <i class="fas fa-brain me-2"></i>Auto-indexation IA
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="aiIndexingContent">
                                <!-- Le contenu sera injecté dynamiquement -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <div class="ai-privacy-notice">
                                <i class="fas fa-info-circle text-info"></i>
                                <small class="text-muted">
                                    Les images seront envoyées de manière sécurisée vers l'API Mistral pour analyse. 
                                    Aucune donnée n'est stockée sur leurs serveurs.
                                </small>
                            </div>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fermer</button>
                            <button type="button" class="btn btn-success" id="applyAiSuggestions" style="display: none;">
                                <i class="fas fa-check"></i> Appliquer les suggestions
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter le modal au DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = new bootstrap.Modal(document.getElementById('aiIndexingModal'));
        
        // Attacher les event listeners
        document.getElementById('applyAiSuggestions').addEventListener('click', () => {
            this.applySuggestions();
        });
    }
    
    /**
     * Démarre l'auto-indexation des images sélectionnées
     */
    async startAutoIndexing() {
        if (this.isProcessing) return;
        
        const selectedImages = this.getSelectedImages();
        
        // Debug détaillé
        console.log('🔍 Debug sélection d\'images:');
        console.log(`- Images sélectionnées trouvées: ${selectedImages.length}`);
        console.log(`- Liste des images: `, selectedImages);
        
        // Vérifier le système de sélection global
        if (typeof window.selectedImages !== 'undefined' && window.selectedImages instanceof Set) {
            console.log(`- Système de sélection global détecté: ${window.selectedImages.size} images dans le Set`);
        }
        
        // Vérifier les cartes d'images sélectionnées visuellement
        const visuallySelected = document.querySelectorAll('.image-card.selected');
        console.log(`- Images visuellement sélectionnées: ${visuallySelected.length}`);
        
        if (selectedImages.length === 0) {
            let message = 'Aucune image sélectionnée.';
            
            // Ajouter des instructions selon le contexte
            const totalImages = document.querySelectorAll('.image-card').length;
            if (totalImages > 0) {
                message += ` Cliquez sur les images pour les sélectionner (${totalImages} image(s) disponible(s)).`;
            } else {
                message += ' Aucune image disponible.';
            }
            
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
        this.isProcessing = true;
        
        // Afficher le modal
        this.showProcessingModal(selectedImages);
        this.modal.show();
        
        try {
            // Analyser les images
            await this.analyzeImages(selectedImages);
        } catch (error) {
            console.error('Erreur lors de l\'auto-indexation:', error);
            this.showNotification('Erreur lors de l\'auto-indexation', 'error');
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Récupère les images sélectionnées
     */
    getSelectedImages() {
        // Utiliser le système de sélection existant de l'application
        // Les images sélectionnées sont stockées dans le Set global 'selectedImages'
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
     * Affiche le modal de traitement
     */
    showProcessingModal(images) {
        const content = document.getElementById('aiIndexingContent');
        content.innerHTML = `
            <div class="ai-processing-container">
                <div class="ai-processing-header">
                    <h6><i class="fas fa-cog fa-spin me-2"></i>Analyse en cours...</h6>
                    <p class="text-muted">Analyse de ${images.length} image(s) via Mistral AI</p>
                </div>
                
                <div class="progress mb-3">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         role="progressbar" style="width: 0%" id="aiProgressBar"></div>
                </div>
                
                <div id="aiProgressLog" class="ai-progress-log">
                    <!-- Les logs de progression seront ajoutés ici -->
                </div>
            </div>
        `;
    }
    
    /**
     * Analyse les images via l'API
     */
    async analyzeImages(images) {
        const progressBar = document.getElementById('aiProgressBar');
        const progressLog = document.getElementById('aiProgressLog');
        
        try {
            const response = await fetch('/api/ai-indexing/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    images: images,
                    document_name: this.documentName
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.results = data.results;
                this.showResults();
                
                progressBar.style.width = '100%';
                progressBar.classList.remove('progress-bar-animated');
                
                progressLog.innerHTML += `
                    <div class="ai-log-entry ai-log-success">
                        <i class="fas fa-check-circle"></i>
                        Analyse terminée: ${data.successful}/${data.total_processed} images analysées avec succès
                    </div>
                `;
            } else {
                throw new Error(data.error || 'Erreur inconnue');
            }
            
        } catch (error) {
            progressLog.innerHTML += `
                <div class="ai-log-entry ai-log-error">
                    <i class="fas fa-times-circle"></i>
                    Erreur: ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * Affiche les résultats de l'analyse
     */
    showResults() {
        const content = document.getElementById('aiIndexingContent');
        const applyButton = document.getElementById('applyAiSuggestions');
        
        let resultsHTML = `
            <div class="ai-results-container">
                <div class="ai-results-header">
                    <h6><i class="fas fa-brain me-2"></i>Résultats de l'analyse IA</h6>
                    <p class="text-muted">Suggestions de titres et tags pour vos images</p>
                </div>
                
                <div class="ai-results-grid">
        `;
        
        let hasValidResults = false;
        
        this.results.forEach(result => {
            if (result.success) {
                hasValidResults = true;
                resultsHTML += `
                    <div class="ai-result-item" data-filename="${result.filename}">
                        <div class="ai-result-header">
                            <div class="ai-result-filename">${result.filename}</div>
                            <label class="ai-result-checkbox">
                                <input type="checkbox" checked class="ai-suggestion-checkbox">
                                <span class="checkmark"></span>
                            </label>
                        </div>
                        
                        <div class="ai-result-content">
                            <div class="ai-result-field">
                                <label>Nouveau nom suggéré:</label>
                                <input type="text" class="form-control ai-suggested-filename" 
                                       value="${result.suggested_filename}" data-original="${result.filename}">
                            </div>
                            
                            <div class="ai-result-field">
                                <label>Titre généré:</label>
                                <span class="ai-generated-title">${result.title}</span>
                            </div>
                            
                            <div class="ai-result-field">
                                <label>Tags:</label>
                                <div class="ai-tags">
                                    ${result.tags.map(tag => `<span class="ai-tag">${tag}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                resultsHTML += `
                    <div class="ai-result-item ai-result-error">
                        <div class="ai-result-header">
                            <div class="ai-result-filename">${result.filename}</div>
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                        </div>
                        <div class="ai-result-error-message">
                            <i class="fas fa-times-circle"></i>
                            ${result.error}
                        </div>
                    </div>
                `;
            }
        });
        
        resultsHTML += `
                </div>
                
                <div class="ai-results-controls mt-3">
                    <button type="button" class="btn btn-sm btn-outline-primary" id="selectAllSuggestions">
                        <i class="fas fa-check-square"></i> Tout sélectionner
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="unselectAllSuggestions">
                        <i class="fas fa-square"></i> Tout désélectionner
                    </button>
                </div>
            </div>
        `;
        
        content.innerHTML = resultsHTML;
        
        if (hasValidResults) {
            applyButton.style.display = 'inline-block';
        }
        
        // Attacher les event listeners
        document.getElementById('selectAllSuggestions')?.addEventListener('click', () => {
            document.querySelectorAll('.ai-suggestion-checkbox').forEach(cb => cb.checked = true);
        });
        
        document.getElementById('unselectAllSuggestions')?.addEventListener('click', () => {
            document.querySelectorAll('.ai-suggestion-checkbox').forEach(cb => cb.checked = false);
        });
    }
    
    /**
     * Applique les suggestions sélectionnées
     */
    async applySuggestions() {
        const selectedSuggestions = [];
        
        document.querySelectorAll('.ai-suggestion-checkbox:checked').forEach(checkbox => {
            const item = checkbox.closest('.ai-result-item');
            const filenameInput = item.querySelector('.ai-suggested-filename');
            const originalFilename = item.dataset.filename;
            
            if (filenameInput && originalFilename) {
                selectedSuggestions.push({
                    old_filename: originalFilename,
                    new_filename: filenameInput.value
                });
            }
        });
        
        if (selectedSuggestions.length === 0) {
            this.showNotification('Aucune suggestion sélectionnée', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/ai-indexing/rename', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    renames: selectedSuggestions,
                    document_name: this.documentName
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification(
                    `${data.successful}/${data.total_processed} images renommées avec succès`,
                    'success'
                );
                
                // Fermer le modal et mettre à jour l'interface sans recharger
                this.modal.hide();
                
                // Mettre à jour l'interface immédiatement
                this.updateInterfaceAfterRename(selectedSuggestions, data);
            } else {
                throw new Error(data.error || 'Erreur lors du renommage');
            }
            
        } catch (error) {
            this.showNotification(`Erreur lors du renommage: ${error.message}`, 'error');
        }
    }
    
    /**
     * Met à jour l'interface après renommage sans recharger la page
     */
    updateInterfaceAfterRename(selectedSuggestions, data) {
        console.log('🔄 Mise à jour interface après renommage IA...');
        
        selectedSuggestions.forEach(suggestion => {
            const oldFilename = suggestion.old_filename;
            const newFilename = suggestion.new_filename;
            
            // Mettre à jour dans le DOM
            this.updateImageInDOM(oldFilename, newFilename);
            
            // Mettre à jour dans extractedImages si disponible
            this.updateExtractedImagesArray(oldFilename, newFilename);
            
            // Mettre à jour dans appState.sections si disponible
            this.updateSectionsArray(oldFilename, newFilename);
        });
        
        // Mettre à jour les statistiques
        if (typeof updateStats === 'function') {
            updateStats();
        }
        
        // Re-rendre les sections pour mettre à jour les noms de fichiers affichés
        if (typeof renderSections === 'function') {
            renderSections();
        }
        
        console.log('✅ Interface mise à jour avec succès');
    }
    
    /**
     * Met à jour une image dans le DOM (adapté de image-editor.js)
     */
    updateImageInDOM(originalFilename, newFilename) {
        console.log(`[AI-Indexing] updateImageInDOM: ${originalFilename} -> ${newFilename}`);
        
        const imageCard = document.querySelector(`[data-image-filename="${originalFilename}"]`);
        if (!imageCard) {
            console.error(`[AI-Indexing] Image card non trouvée pour: ${originalFilename}`);
            return false;
        }
        
        try {
            // 1. Mettre à jour l'attribut data-image-filename de la carte
            imageCard.setAttribute('data-image-filename', newFilename);
            
            // 2. Mettre à jour l'image src avec timestamp
            const imgElement = imageCard.querySelector('img');
            if (imgElement) {
                const baseSrc = imgElement.src.substring(0, imgElement.src.lastIndexOf('/') + 1);
                const newImageSrc = `${baseSrc}${newFilename}?t=${Date.now()}`;
                imgElement.src = newImageSrc;
                imgElement.alt = newFilename;
                
                // Mettre à jour le double-clic
                imgElement.ondblclick = (event) => {
                    if (typeof showImagePreview === 'function') {
                        showImagePreview(newFilename, event);
                    }
                };
            }
            
            // 3. Mettre à jour l'attribut onclick de la carte pour la sélection
            imageCard.setAttribute('onclick', `toggleImageSelectionByClick('${newFilename}')`);
            
            // 4. Mettre à jour tous les boutons d'action
            const zoomBtn = imageCard.querySelector('.btn-zoom');
            if (zoomBtn) {
                zoomBtn.setAttribute('onclick', `showImagePreview('${newFilename}', event)`);
            }
            
            const assignBtn = imageCard.querySelector('.btn-assign');
            if (assignBtn) {
                assignBtn.setAttribute('onclick', `showSectionSelector('${newFilename}', event)`);
            }
            
            const deleteBtn = imageCard.querySelector('.btn-image-delete');
            if (deleteBtn) {
                deleteBtn.setAttribute('onclick', `deleteImage('${newFilename}', event)`);
            }
            
            // 5. Mettre à jour le nom du fichier affiché
            const filenameElement = imageCard.querySelector('.image-filename');
            if (filenameElement) {
                filenameElement.textContent = newFilename;
            }
            
            // Ajouter un effet visuel pour montrer que l'image a été renommée
            imageCard.style.border = '3px solid #3B82F6'; // Bleu pour renommage IA
            setTimeout(() => {
                imageCard.style.border = '';
            }, 3000);
            
            console.log(`[AI-Indexing] ✅ Carte mise à jour: ${newFilename}`);
            return true;
            
        } catch (error) {
            console.error('[AI-Indexing] ❌ Erreur mise à jour DOM:', error);
            return false;
        }
    }
    
    /**
     * Met à jour le tableau extractedImages (adapté de image-editor.js)
     */
    updateExtractedImagesArray(originalFilename, newFilename) {
        if (typeof extractedImages !== 'undefined' && Array.isArray(extractedImages)) {
            const index = extractedImages.findIndex(img => img.filename === originalFilename);
            if (index !== -1) {
                extractedImages[index].filename = newFilename;
                console.log(`[AI-Indexing] ✅ extractedImages mis à jour: ${originalFilename} -> ${newFilename}`);
            }
        }
    }
    
    /**
     * Met à jour le tableau des sections (spécifique à l'application)
     */
    updateSectionsArray(originalFilename, newFilename) {
        if (typeof appState !== 'undefined' && appState.sections && Array.isArray(appState.sections)) {
            appState.sections.forEach(section => {
                if (section.images && Array.isArray(section.images)) {
                    const imageIndex = section.images.findIndex(img => img.filename === originalFilename);
                    if (imageIndex !== -1) {
                        section.images[imageIndex].filename = newFilename;
                        console.log(`[AI-Indexing] ✅ Section ${section.number} mise à jour: ${originalFilename} -> ${newFilename}`);
                    }
                }
            });
        }
        
        // Mettre à jour aussi dans selectedImages si l'image était sélectionnée
        if (typeof window.selectedImages !== 'undefined' && window.selectedImages instanceof Set) {
            if (window.selectedImages.has(originalFilename)) {
                window.selectedImages.delete(originalFilename);
                window.selectedImages.add(newFilename);
                console.log(`[AI-Indexing] ✅ selectedImages mis à jour: ${originalFilename} -> ${newFilename}`);
            }
        }
    }
    
    /**
     * Affiche une notification
     */
    showNotification(message, type = 'info') {
        // Utiliser le système de notification existant ou créer un simple toast
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
});

// Fonction globale pour démarrer l'auto-indexation (appelée par le bouton)
function startAIIndexing() {
    if (aiIndexingManager) {
        aiIndexingManager.startAutoIndexing();
    }
} 