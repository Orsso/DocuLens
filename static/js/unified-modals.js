/**
 * Unified Modal System pour DocuLens
 * Gère tous les pop-ups avec un style uniforme frost-glass dark-blue
 */

class UnifiedModal {
    constructor(id, options = {}) {
        this.id = id;
        this.options = {
            size: 'default', // compact, default, large, xl
            backdrop: true,
            keyboard: true,
            animation: true,
            ...options
        };
        this.element = null;
        this.isVisible = false;
        this.callbacks = {};
    }

    create(content) {
        if (this.element) {
            this.element.remove();
        }

        const sizeClass = this.options.size !== 'default' ? this.options.size : '';
        
        this.element = document.createElement('div');
        this.element.className = 'unified-modal';
        this.element.id = this.id;
        this.element.innerHTML = `
            <div class="unified-modal-content ${sizeClass}">
                ${content}
            </div>
        `;

        document.body.appendChild(this.element);
        this.attachEventListeners();
        return this;
    }

    attachEventListeners() {
        // Fermer en cliquant sur le backdrop
        if (this.options.backdrop) {
            this.element.addEventListener('click', (e) => {
                if (e.target === this.element) {
                    this.hide();
                }
            });
        }

        // Fermer avec Escape
        if (this.options.keyboard) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isVisible) {
                    this.hide();
                }
            });
        }

        // Boutons de fermeture
        const closeButtons = this.element.querySelectorAll('.unified-modal-close, [data-dismiss="modal"]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });
    }

    show() {
        if (this.element) {
            this.element.classList.add('show');
            this.isVisible = true;
            document.body.style.overflow = 'hidden';
            
            // Callback onShow
            if (this.callbacks.onShow) {
                this.callbacks.onShow();
            }
        }
        return this;
    }

    hide() {
        if (this.element) {
            this.element.classList.remove('show');
            this.isVisible = false;
            document.body.style.overflow = '';
            
            // Callback onHide
            if (this.callbacks.onHide) {
                this.callbacks.onHide();
            }
        }
        return this;
    }

    destroy() {
        if (this.element) {
            this.hide();
            setTimeout(() => {
                this.element.remove();
                this.element = null;
            }, 300);
        }
        return this;
    }

    on(event, callback) {
        this.callbacks[event] = callback;
        return this;
    }

    setContent(content) {
        if (this.element) {
            const contentDiv = this.element.querySelector('.unified-modal-content');
            contentDiv.innerHTML = content;
            this.attachEventListeners();
        }
        return this;
    }
}

// Gestionnaire de modals unifié
class ModalManager {
    constructor() {
        this.modals = new Map();
        this.activeModal = null;
    }

    create(id, options = {}) {
        const modal = new UnifiedModal(id, options);
        this.modals.set(id, modal);
        return modal;
    }

    get(id) {
        return this.modals.get(id);
    }

    destroy(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.destroy();
            this.modals.delete(id);
        }
    }

    hideAll() {
        this.modals.forEach(modal => modal.hide());
    }
}

// Instance globale
const modalManager = new ModalManager();

// Modal d'indexation IA avec validation de confidentialité
class AIIndexingModal {
    constructor() {
        this.modal = null;
        this.step = 'confirmation'; // confirmation, processing, results
        this.progress = 0;
        this.results = [];
        this.selectedImages = [];
    }

    show(selectedImages = []) {
        this.selectedImages = selectedImages;
        this.step = 'confirmation';
        
        if (!this.modal) {
            this.modal = modalManager.create('aiIndexingModal', { 
                size: 'large',
                backdrop: false,
                keyboard: false
            });
        }

        this.modal.create(this.getContent()).show();
        this.attachEventListeners();
    }

    getContent() {
        switch (this.step) {
            case 'confirmation':
                return this.getConfirmationContent();
            case 'processing':
                return this.getProcessingContent();
            case 'results':
                return this.getResultsContent();
            default:
                return this.getConfirmationContent();
        }
    }

    getConfirmationContent() {
        return `
            <div class="unified-modal-header">
                <h5 class="unified-modal-title">
                    <i class="fas fa-brain"></i>
                    Confirmation d'indexation IA
                </h5>
                <button class="unified-modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="unified-modal-body compact">
                <div class="frost-notification warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>Information importante</strong><br>
                        Cette action enverra vos images aux serveurs de Mistral AI pour analyse. 
                        Bien que vos données soient traitées de manière sécurisée, elles pourraient 
                        être utilisées pour l'entraînement de leurs modèles.
                    </div>
                </div>
                
                <div style="margin: 1rem 0;">
                    <p><strong>${this.selectedImages.length} image(s) sélectionnée(s)</strong> seront analysées 
                    pour génération automatique de noms et de tags.</p>
                </div>

                <div class="frost-image-grid" style="max-height: 200px; overflow-y: auto;">
                    ${this.selectedImages.map(img => `
                        <div class="frost-image-preview">
                            <img src="/image/${encodeURIComponent(appState.documentName)}/${encodeURIComponent(img)}" alt="${img}">
                            <div class="frost-image-preview-overlay">
                                ${img.split('/').pop()}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="unified-modal-footer">
                <div></div>
                <div class="unified-modal-actions">
                    <button class="frost-btn secondary" data-dismiss="modal">
                        <i class="fas fa-times"></i>
                        Annuler
                    </button>
                    <button class="frost-btn success" id="confirmAiIndexing">
                        <i class="fas fa-check"></i>
                        Confirmer l'indexation
                    </button>
                </div>
            </div>
        `;
    }

    getProcessingContent() {
        return `
            <div class="unified-modal-header">
                <h5 class="unified-modal-title">
                    <i class="fas fa-brain"></i>
                    Indexation IA en cours...
                </h5>
            </div>
            <div class="unified-modal-body">
                <div class="frost-loading">
                    <div class="frost-spinner"></div>
                    <div>
                        <h6>Analyse des images en cours...</h6>
                        <p>Veuillez patienter pendant que l'IA analyse vos images.</p>
                    </div>
                </div>
                
                <div class="frost-progress">
                    <div class="frost-progress-bar animated" id="aiProgressBar" style="width: ${this.progress}%"></div>
                </div>
                
                <div style="text-align: center; color: var(--frost-text-secondary);">
                    <small>Progression: ${this.progress}% - ${Math.ceil(this.progress * this.selectedImages.length / 100)} / ${this.selectedImages.length} images traitées</small>
                </div>
            </div>
        `;
    }

    getResultsContent() {
        return `
            <div class="unified-modal-header">
                <h5 class="unified-modal-title">
                    <i class="fas fa-check-circle"></i>
                    Résultats de l'indexation
                </h5>
                <button class="unified-modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="unified-modal-body">
                <div class="frost-notification success">
                    <i class="fas fa-check-circle"></i>
                    <div>
                        <strong>Indexation terminée !</strong><br>
                        ${this.results.length} suggestions de noms générées. 
                        Vérifiez et validez les noms proposés ci-dessous.
                    </div>
                </div>

                <div style="max-height: 400px; overflow-y: auto;">
                    ${this.results.map((result, index) => {
                        console.log(`🎨 Affichage résultat ${index}:`, result);
                        console.log(`💡 Propriétés disponibles:`, Object.keys(result));
                        
                        return `
                        <div class="ai-result-item" style="margin-bottom: 1rem;">
                            <div class="ai-result-header" style="display: flex; align-items: center;">
                                <div class="frost-image-preview" style="width: 80px; height: 80px; flex-shrink: 0; margin-right: 1rem;">
                                    <img src="/image/${encodeURIComponent(appState.documentName)}/${encodeURIComponent(result.filename)}" 
                                         alt="${result.filename}" 
                                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;"
                                         onerror="console.error('Erreur chargement image:', this.src); this.style.background='#f3f4f6'; this.alt='Image non trouvée';">
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="ai-result-filename" style="font-size: 0.8rem; color: var(--frost-text-secondary); margin-bottom: 0.5rem;">
                                        Image originale: <strong>${result.filename}</strong>
                                    </div>
                                    <div style="margin-bottom: 0.5rem;">
                                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.9rem; font-weight: 500; color: var(--frost-text-primary);">
                                            <i class="fas fa-brain" style="color: var(--frost-accent); margin-right: 0.25rem;"></i>
                                            Nom suggéré par l'IA:
                                        </label>
                                                                                <input type="text" 
                                               class="ai-suggested-filename" 
                                               value="${result.suggested_name || result.title || result.filename}" 
                                               data-original="${result.filename}" 
                                               data-index="${index}"
                                               style="width: 100%; padding: 0.5rem; border: 1px solid var(--frost-border); border-radius: 4px; background: var(--frost-bg-secondary); color: var(--frost-text-primary);">
                                    </div>
                                    ${result.tags && result.tags.length > 0 ? `
                                         <div style="margin-top: 0.5rem;">
                                             <small style="color: var(--frost-text-secondary);">
                                                  <i class="fas fa-tags"></i> ${result.tags.join(', ')}
                                                  ${result.confidence ? ` • Confiance: ${Math.round(result.confidence * 100)}%` : ''}
                                             </small>
                                         </div>
                                     ` : ''}
                                </div>
                                <label class="ai-result-checkbox" style="flex-shrink: 0; margin-left: 1rem;">
                                    <input type="checkbox" checked data-index="${index}">
                                    <span class="checkmark"></span>
                                </label>
                            </div>
                        </div>
                    `;}).join('')}
                </div>
            </div>
            <div class="unified-modal-footer">
                <div>
                    <small style="color: var(--frost-text-secondary);">
                        <i class="fas fa-info-circle"></i>
                        Décochez les éléments que vous ne souhaitez pas appliquer
                    </small>
                </div>
                <div class="unified-modal-actions">
                    <button class="frost-btn secondary" data-dismiss="modal">
                        <i class="fas fa-times"></i>
                        Fermer
                    </button>
                    <button class="frost-btn success" id="applyAiSuggestions">
                        <i class="fas fa-check"></i>
                        Appliquer les suggestions
                    </button>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const confirmBtn = document.getElementById('confirmAiIndexing');
        const applyBtn = document.getElementById('applyAiSuggestions');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.startProcessing());
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySuggestions());
        }
    }

    async startProcessing() {
        this.step = 'processing';
        this.progress = 0;
        this.modal.setContent(this.getContent());

        // Simuler le traitement avec vraie barre de progression
        await this.processImages();
    }

    async processImages() {
        try {
            const progressBar = document.getElementById('aiProgressBar');
            
            // Envoyer les images par batch pour le traitement
            const batchSize = 3;
            const totalImages = this.selectedImages.length;
            let processedImages = 0;
            
            for (let i = 0; i < totalImages; i += batchSize) {
                const batch = this.selectedImages.slice(i, Math.min(i + batchSize, totalImages));
                
                let batchResults;
                
                // Appel API OBLIGATOIRE - Plus de simulation inutile
                console.log('🚀 Appel API avec:', {
                    images: batch,
                    document_name: window.appState?.documentName
                });
                
                const response = await fetch('/api/ai-indexing/analyze', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        images: batch,
                        document_name: window.appState?.documentName
                    })
                });

                console.log('🌐 Réponse API reçue, status:', response.status, 'ok:', response.ok);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ API erreur:', response.status, errorText);
                    throw new Error(`Erreur API ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                console.log('🔍 Données reçues de l\'API:', data);
                console.log('🔍 Structure complète:', JSON.stringify(data, null, 2));
                
                if (!data.results || !Array.isArray(data.results)) {
                    throw new Error('Format de réponse API invalide');
                }
                
                batchResults = data.results;
                console.log('✅ API utilisée avec succès:', batchResults.length, 'résultats');

                this.results.push(...batchResults);
                
                processedImages += batch.length;
                this.progress = Math.round((processedImages / totalImages) * 100);
                
                // Mettre à jour la barre de progression
                if (progressBar) {
                    progressBar.style.width = this.progress + '%';
                }
                
                // Mettre à jour le texte de progression
                const body = this.modal.element.querySelector('.unified-modal-body');
                const progressText = body.querySelector('small');
                if (progressText) {
                    progressText.textContent = `Progression: ${this.progress}% - ${processedImages} / ${totalImages} images traitées`;
                }

                // Petit délai pour l'animation
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            // Passer aux résultats après un délai
            setTimeout(() => {
                console.log('Passage aux résultats avec:', this.results);
                this.step = 'results';
                this.modal.setContent(this.getContent());
                this.attachEventListeners();
            }, 1000);

        } catch (error) {
            console.error('Erreur lors du traitement:', error);
            this.showError('Erreur lors de l\'indexation des images');
        }
    }

    async applySuggestions() {
        const checkboxes = this.modal.element.querySelectorAll('input[type="checkbox"]:checked');
        const suggestions = [];

        checkboxes.forEach(checkbox => {
            const index = parseInt(checkbox.dataset.index);
            const input = this.modal.element.querySelector(`input[data-index="${index}"]`);
            if (input) {
                suggestions.push({
                    original: input.dataset.original,
                    suggested: input.value,
                    index: index
                });
            }
        });

        if (suggestions.length === 0) {
            this.showNotification('Aucune suggestion sélectionnée', 'warning');
            return;
        }

        try {
            console.log('🚀 [v3.0] Application de', suggestions.length, 'suggestions (métadonnées uniquement)');

            // 🚀 v3.0: NOUVEAU - Traitement local pur (pas d'API renommage)
            const metadataSuggestions = suggestions.map(s => {
                const cleanTitle = s.suggested.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ');
                return {
                    filename: s.original,           // Nom physique IMMUABLE (inchangé)
                    suggested_name: cleanTitle      // Nom IA pour affichage
                };
            });

            console.log('📋 [v3.0] Métadonnées à appliquer:', metadataSuggestions);

            // Appliquer directement les métadonnées IA dans appState
            if (window.aiIndexingManager) {
                const success = await window.aiIndexingManager.applyAISuggestions(metadataSuggestions);
                
                if (success) {
                    this.modal.hide();
                    this.showNotification(
                        `${metadataSuggestions.length} image(s) indexée(s) avec succès (métadonnées IA)`, 
                        'success'
                    );
                } else {
                    throw new Error('Échec lors de l\'application des métadonnées IA');
                }
            } else {
                throw new Error('aiIndexingManager non disponible');
            }

        } catch (error) {
            console.error('❌ [v3.0] Erreur lors de l\'application:', error);
            this.showError(`Erreur lors de l'application: ${error.message}`);
        }
    }

    showError(message) {
        const errorContent = `
            <div class="unified-modal-header">
                <h5 class="unified-modal-title">
                    <i class="fas fa-exclamation-triangle"></i>
                    Erreur
                </h5>
                <button class="unified-modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="unified-modal-body compact">
                <div class="frost-notification error">
                    <i class="fas fa-times-circle"></i>
                    <div>${message}</div>
                </div>
            </div>
            <div class="unified-modal-footer">
                <div></div>
                <div class="unified-modal-actions">
                    <button class="frost-btn secondary" data-dismiss="modal">
                        <i class="fas fa-times"></i>
                        Fermer
                    </button>
                </div>
            </div>
        `;
        
        this.modal.setContent(errorContent);
    }

    showNotification(message, type = 'info') {
        // Utiliser le système de notification existant ou créer un toast
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Modal d'aide avec onglets
class HelpModal {
    constructor() {
        this.modal = null;
        this.activeTab = 'tips';
    }

    show() {
        if (!this.modal) {
            this.modal = modalManager.create('helpModal', { size: 'large' });
        }

        this.modal.create(this.getContent()).show();
        this.attachEventListeners();
    }

    getContent() {
        return `
            <div class="unified-modal-header">
                <h5 class="unified-modal-title">
                    <i class="fas fa-question-circle"></i>
                    Centre d'aide
                </h5>
                <button class="unified-modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="unified-modal-body">
                <div class="unified-tabs">
                    <button class="unified-tab ${this.activeTab === 'tips' ? 'active' : ''}" data-tab="tips">
                        <i class="fas fa-lightbulb"></i>
                        Conseils d'utilisation
                    </button>
                    <button class="unified-tab ${this.activeTab === 'debug' ? 'active' : ''}" data-tab="debug">
                        <i class="fas fa-bug"></i>
                        Diagnostic système
                    </button>
                </div>

                <div class="unified-tab-content ${this.activeTab === 'tips' ? 'active' : ''}" id="tipsTab">
                    ${this.getTipsContent()}
                </div>

                <div class="unified-tab-content ${this.activeTab === 'debug' ? 'active' : ''}" id="debugTab">
                    ${this.getDebugContent()}
                </div>
            </div>
            <div class="unified-modal-footer">
                <div></div>
                <div class="unified-modal-actions">
                    <button class="frost-btn secondary" data-dismiss="modal">
                        <i class="fas fa-times"></i>
                        Fermer
                    </button>
                </div>
            </div>
        `;
    }

    getTipsContent() {
        return `
            <div style="padding: 1rem 0;">
                <div class="tip-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <i class="fas fa-plus-circle" style="color: var(--frost-text-accent); font-size: 1.5rem;"></i>
                    <span>Utilisez le bouton violet sur une section pour créer une sous-section</span>
                </div>
                
                <div class="tip-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <i class="fas fa-edit" style="color: var(--frost-text-accent); font-size: 1.5rem;"></i>
                    <span>Cliquez sur la boîte bleue du numéro pour modifier la nomenclature (ex: ANNEXE-A)</span>
                </div>
                
                <div class="tip-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <i class="fas fa-arrows-alt" style="color: var(--frost-text-accent); font-size: 1.5rem;"></i>
                    <span>Glissez-déposez les sections par leur boîte bleue pour les réorganiser</span>
                </div>

                <div class="tip-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <i class="fas fa-mouse-pointer" style="color: var(--frost-text-accent); font-size: 1.5rem;"></i>
                    <span>Cliquez sur les images pour les sélectionner avant l'indexation IA</span>
                </div>

                <div class="tip-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <i class="fas fa-brain" style="color: var(--frost-text-accent); font-size: 1.5rem;"></i>
                    <span>L'IA peut générer automatiquement des noms pertinents pour vos images</span>
                </div>
            </div>
        `;
    }

    getDebugContent() {
        // Récupérer les informations de debug depuis la fonction existante
        return '<div id="debugContent">Chargement des informations de diagnostic...</div>';
    }

    attachEventListeners() {
        // Gestion des onglets
        const tabs = this.modal.element.querySelectorAll('.unified-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Charger le contenu de debug si nécessaire
        if (this.activeTab === 'debug') {
            this.loadDebugContent();
        }
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        
        // Mettre à jour les onglets
        const tabs = this.modal.element.querySelectorAll('.unified-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Mettre à jour le contenu
        const contents = this.modal.element.querySelectorAll('.unified-tab-content');
        contents.forEach(content => {
            content.classList.toggle('active', content.id === tabName + 'Tab');
        });

        // Charger le contenu de debug si nécessaire
        if (tabName === 'debug') {
            this.loadDebugContent();
        }
    }

    loadDebugContent() {
        const debugContent = this.modal.element.querySelector('#debugContent');
        if (debugContent && typeof generateDebugInfo === 'function') {
            debugContent.innerHTML = generateDebugInfo();
        }
    }
}

// Instances globales
const aiIndexingModal = new AIIndexingModal();
const helpModal = new HelpModal();

// Fonctions globales pour compatibility
function showAIIndexingModal(selectedImages = []) {
    aiIndexingModal.show(selectedImages);
}

function showHelpModal() {
    helpModal.show();
}

// Fonction pour démarrer l'indexation IA (remplace l'ancienne)
function startAIIndexing() {
    const selectedImages = getSelectedImages();
    if (selectedImages.length === 0) {
        showToast('Veuillez sélectionner au moins une image pour l\'indexation IA', 'warning');
        return;
    }
    showAIIndexingModal(selectedImages);
}

// Fonction pour récupérer les images sélectionnées
function getSelectedImages() {
    if (typeof window.selectedImages !== 'undefined' && window.selectedImages instanceof Set) {
        return Array.from(window.selectedImages);
    }
    
    // Fallback : chercher les images avec la classe 'selected'
    const selectedElements = document.querySelectorAll('.image-card.selected');
    return Array.from(selectedElements).map(el => el.dataset.filename).filter(Boolean);
}

// Export pour utilisation externe
window.modalManager = modalManager;
window.UnifiedModal = UnifiedModal;
window.aiIndexingModal = aiIndexingModal;
window.helpModal = helpModal; 