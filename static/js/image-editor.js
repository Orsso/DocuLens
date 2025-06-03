/**
 * DocuLens Image Editor
 * Éditeur d'images intégré pour l'annotation de documentation technique
 */

class ImageEditor {
    constructor() {
        this.canvas = null;
        this.originalImage = null;
        this.currentTool = 'select';
        this.currentColor = '#FF0000';
        this.strokeWidth = 2;
        this.opacity = 1;
        this.history = [];
        this.historyStep = 0;
        this.isDrawing = false;
        this.modal = null;
        this.currentImageData = null;
        
        this.tools = {
            select: { cursor: 'default' },
            rectangle: { cursor: 'crosshair' },
            circle: { cursor: 'crosshair' },
            arrow: { cursor: 'crosshair' },
            line: { cursor: 'crosshair' },
            text: { cursor: 'text' },
            pen: { cursor: 'crosshair' }
        };
        
        this.layers = [];
        this.currentLayer = null;
        
        this._eventListenersInitialized = false;
        this.initEventListeners();
    }
    
    /**
     * Initialise l'éditeur avec une image
     */
    async openEditor(imageFilename, imageData = null) {
        try {
            this.currentImageData = imageData || { filename: imageFilename };
            
            // Afficher la modal avec animation
            const modalElement = document.getElementById('imageEditorModal');
            this.modal = new bootstrap.Modal(modalElement, {
                backdrop: 'static',
                keyboard: false
            });
            this.modal.show();
            
            // Attendre que la modal soit complètement ouverte et ajouter l'animation
            await new Promise(resolve => {
                modalElement.addEventListener('shown.bs.modal', () => {
                    modalElement.querySelector('.image-editor-modal').classList.add('show');
                    setTimeout(resolve, 400); // Attendre la fin de l'animation
                }, { once: true });
            });
            
            // Initialiser le canvas
            await this.initCanvas();
            
            // Charger l'image
            await this.loadImage(imageFilename);
            
            // Mettre à jour l'interface
            this.updateUI();
            
            if (typeof logInfo === 'function') {
                logInfo('✅ Éditeur d\'images ouvert pour:', imageFilename);
            }
            
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Erreur lors de l\'ouverture de l\'éditeur:', error);
            }
            this.showError('Erreur lors du chargement de l\'éditeur d\'images');
        }
    }
    
    /**
     * Initialise le canvas Fabric.js
     */
    async initCanvas() {
        if (this.canvas) {
            this.canvas.dispose();
        }
        
        // Vérifier que Fabric.js est chargé
        if (typeof fabric === 'undefined') {
            await this.loadFabricJS();
        }
        
        const canvasElement = document.getElementById('imageEditorCanvas');
        this.canvas = new fabric.Canvas(canvasElement, {
            width: 800,
            height: 600,
            backgroundColor: '#f0f0f0',
            selection: true,
            preserveObjectStacking: true
        });
        
        // Événements du canvas
        this.canvas.on('mouse:down', (e) => this.onMouseDown(e));
        this.canvas.on('mouse:move', (e) => this.onMouseMove(e));
        this.canvas.on('mouse:up', (e) => this.onMouseUp(e));
        
        // Variables pour le panning
        this.isPanning = false;
        this.lastPanPoint = null;
        this.canvas.on('object:added', () => this.saveState());
        this.canvas.on('object:removed', () => this.saveState());
        this.canvas.on('object:modified', () => this.saveState());
        
        // Gestion du zoom avec la molette + Shift
        this.canvas.on('mouse:wheel', (opt) => this.handleMouseWheel(opt));
        
        // Gestion des touches de clavier
        this.setupCanvasKeyboardEvents();
        
        // Gestion de la sélection d'objets
        this.canvas.on('selection:created', () => this.updateDeleteButtonVisibility());
        this.canvas.on('selection:updated', () => this.updateDeleteButtonVisibility());
        this.canvas.on('selection:cleared', () => this.updateDeleteButtonVisibility());
        
        // Double-clic pour éditer les textes
        this.canvas.on('mouse:dblclick', (e) => {
            if (e.target && (e.target.type === 'i-text' || e.target.type === 'text')) {
                if (typeof logInfo === 'function') {
                    logInfo('📝 Double-clic sur texte détecté');
                }
                this.editTextObject(e.target);
            }
        });
        
        // Initialiser l'historique
        this.saveState();
    }
    
    /**
     * Charge Fabric.js si nécessaire
     */
    async loadFabricJS() {
        return new Promise((resolve, reject) => {
            if (typeof fabric !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Charge une image dans l'éditeur
     */
    async loadImage(filename) {
        return new Promise((resolve, reject) => {
            // Pour les tests, créer un canvas vide si pas d'image
            if (filename === 'test.jpg') {
                // Dimensionner le canvas pour les tests
                const containerWidth = document.querySelector('.canvas-wrapper').clientWidth - 40;
                const containerHeight = document.querySelector('.canvas-wrapper').clientHeight - 40;
                
                this.canvas.setWidth(Math.min(800, containerWidth));
                this.canvas.setHeight(Math.min(600, containerHeight));
                this.canvas.backgroundColor = '#ffffff';
                
                // Mettre à jour le nom de l'image
                document.getElementById('editorImageName').textContent = `- ${filename}`;
                
                // Mettre à jour l'affichage du zoom initial
                this.updateZoomDisplay();
                
                resolve();
                return;
            }
            
            // Ajouter un timestamp pour forcer le rechargement et éviter le cache
            const imagePath = `/image/${appState.documentName}/${filename}?t=${Date.now()}`;
            console.log(`[ImageEditor] Loading image for Fabric: ${imagePath}`); // Log pour vérifier
            
            fabric.Image.fromURL(imagePath, (img) => {
                if (!img) {
                    reject(new Error('Impossible de charger l\'image'));
                    return;
                }
                
                this.originalImage = img;
                
                // Calculer les dimensions pour s'adapter au canvas
                const containerWidth = document.querySelector('.canvas-wrapper').clientWidth - 40;
                const containerHeight = document.querySelector('.canvas-wrapper').clientHeight - 40;
                
                const scale = Math.min(
                    containerWidth / img.width,
                    containerHeight / img.height,
                    1 // Ne pas agrandir l'image
                );
                
                // Redimensionner le canvas
                this.canvas.setWidth(img.width * scale);
                this.canvas.setHeight(img.height * scale);
                
                // Configurer l'image de fond
                img.set({
                    left: 0,
                    top: 0,
                    scaleX: scale,
                    scaleY: scale,
                    selectable: false,
                    evented: false
                });
                
                this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas));
                
                // Mettre à jour le nom de l'image
                document.getElementById('editorImageName').textContent = `- ${filename}`;
                
                // Mettre à jour l'affichage du zoom initial
                this.updateZoomDisplay();
                
                resolve();
            });
        });
    }
    
    /**
     * Gestion des événements de souris
     */
    onMouseDown(e) {
        const pointer = this.canvas.getPointer(e.e);
        
        // Vérifier si Ctrl est pressé pour le panning
        if (e.e.ctrlKey || e.e.metaKey) {
            this.isPanning = true;
            this.lastPanPoint = { x: e.e.clientX, y: e.e.clientY };
            this.canvas.defaultCursor = 'grab';
            this.canvas.hoverCursor = 'grab';
            return;
        }
        
        // Si on utilise l'outil de sélection, laisser Fabric.js gérer
        if (this.currentTool === 'select') return;
        
        // Si on clique sur un objet existant, ne pas créer de nouveau élément
        if (e.target && e.target !== this.canvas) {
            return;
        }
        
        this.isDrawing = true;
        this.startX = pointer.x;
        this.startY = pointer.y;
        
        switch (this.currentTool) {
            case 'pen':
                this.startFreeDrawing();
                break;
            case 'text':
                this.addText(pointer.x, pointer.y);
                break;
        }
    }
    
    onMouseMove(e) {
        // Gestion du panning avec Ctrl
        if (this.isPanning && this.lastPanPoint) {
            const currentPoint = { x: e.e.clientX, y: e.e.clientY };
            const deltaX = currentPoint.x - this.lastPanPoint.x;
            const deltaY = currentPoint.y - this.lastPanPoint.y;
            
            // Déplacer la vue du canvas
            const vpt = this.canvas.viewportTransform;
            vpt[4] += deltaX;
            vpt[5] += deltaY;
            
            this.canvas.setViewportTransform(vpt);
            this.lastPanPoint = currentPoint;
            return;
        }
        
        if (!this.isDrawing || this.currentTool === 'select' || this.currentTool === 'pen' || this.currentTool === 'text') return;
        
        const pointer = this.canvas.getPointer(e.e);
        
        // Supprimer l'objet temporaire précédent
        if (this.tempObject) {
            this.canvas.remove(this.tempObject);
        }
        
        // Créer un nouvel objet temporaire
        this.tempObject = this.createShape(this.startX, this.startY, pointer.x, pointer.y);
        if (this.tempObject) {
            this.canvas.add(this.tempObject);
            this.canvas.renderAll();
        }
    }
    
    onMouseUp(e) {
        // Arrêter le panning
        if (this.isPanning) {
            this.isPanning = false;
            this.lastPanPoint = null;
            this.canvas.defaultCursor = this.tools[this.currentTool].cursor;
            this.canvas.hoverCursor = this.tools[this.currentTool].cursor;
            return;
        }
        
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        if (this.tempObject) {
            // L'objet temporaire devient permanent
            this.tempObject = null;
        }
        
        if (this.currentTool === 'pen') {
            this.stopFreeDrawing();
        }
    }
    
    /**
     * Crée une forme selon l'outil actuel
     */
    createShape(x1, y1, x2, y2) {
        const options = {
            stroke: this.currentColor,
            strokeWidth: this.strokeWidth,
            fill: 'transparent',
            opacity: this.opacity
        };
        
        switch (this.currentTool) {
            case 'rectangle':
                return new fabric.Rect({
                    left: Math.min(x1, x2),
                    top: Math.min(y1, y2),
                    width: Math.abs(x2 - x1),
                    height: Math.abs(y2 - y1),
                    ...options
                });
                
            case 'circle':
                const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) / 2;
                return new fabric.Circle({
                    left: x1 - radius,
                    top: y1 - radius,
                    radius: radius,
                    ...options
                });
                
            case 'line':
                return new fabric.Line([x1, y1, x2, y2], {
                    ...options,
                    fill: this.currentColor
                });
                
            case 'arrow':
                return this.createArrow(x1, y1, x2, y2, options);
        }
        
        return null;
    }
    
    /**
     * Crée une flèche
     */
    createArrow(x1, y1, x2, y2, options) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headSize = 20;
        
        const group = new fabric.Group([
            // Ligne principale
            new fabric.Line([x1, y1, x2, y2], options),
            // Pointe de la flèche
            new fabric.Line([
                x2, y2,
                x2 - headSize * Math.cos(angle - Math.PI / 6),
                y2 - headSize * Math.sin(angle - Math.PI / 6)
            ], options),
            new fabric.Line([
                x2, y2,
                x2 - headSize * Math.cos(angle + Math.PI / 6),
                y2 - headSize * Math.sin(angle + Math.PI / 6)
            ], options)
        ]);
        
        return group;
    }
    
    /**
     * Ajoute du texte
     */
    addText(x, y) {
        if (typeof logInfo === 'function') {
            logInfo('📝 Création d\'un nouveau texte à:', x, y);
        }
        
        const text = new fabric.IText('Tapez votre texte...', {
            left: x,
            top: y,
            fontFamily: document.getElementById('fontFamily').value,
            fontSize: parseInt(document.getElementById('fontSize').value),
            fill: this.currentColor,
            opacity: this.opacity,
            editable: true,
            selectable: true,
            hasControls: true,
            hasBorders: true
        });
        
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        
        // Entrer en mode édition avec un délai plus long pour s'assurer que tout est prêt
        setTimeout(() => {
            this.editTextObject(text);
        }, 200);
    }
    
    /**
     * Édite un objet texte (fonction centralisée)
     */
    editTextObject(textObj) {
        if (typeof logInfo === 'function') {
            logInfo('✏️ Début édition texte, type:', textObj.type);
        }
        
        try {
            // S'assurer que l'objet est sélectionné
            this.canvas.setActiveObject(textObj);
            this.canvas.renderAll();
            
            // Forcer le focus sur le canvas
            const canvasElement = this.canvas.getElement();
            canvasElement.focus();
            
            // Attendre un peu pour que le canvas soit prêt
            setTimeout(() => {
                // Entrer en mode édition
                textObj.enterEditing();
                
                // Sélectionner tout le texte
                textObj.selectAll();
                
                if (typeof logInfo === 'function') {
                    logInfo('✅ Mode édition activé, isEditing:', textObj.isEditing);
                }
                
                // Forcer le focus sur l'élément de texte caché de Fabric.js
                const focusAttempts = [100, 200, 300]; // Plusieurs tentatives avec délais croissants
                
                focusAttempts.forEach(delay => {
                    setTimeout(() => {
                        // Vérifier si on est toujours en mode édition
                        if (!textObj.isEditing) return;
                        
                        // 1. Chercher la textarea cachée dans le conteneur canvas
                        let targetElement = document.querySelector('.canvas-container textarea');
                        
                        // 2. Chercher dans tout le modal
                        if (!targetElement) {
                            targetElement = document.querySelector('#imageEditorModal textarea');
                        }
                        
                        // 3. Chercher tous les éléments de texte récemment créés
                        if (!targetElement) {
                            const allTextareas = document.querySelectorAll('textarea');
                            const allInputs = document.querySelectorAll('input[type="text"]');
                            
                            // Prendre le dernier élément créé (probablement celui de Fabric.js)
                            if (allTextareas.length > 0) {
                                targetElement = allTextareas[allTextareas.length - 1];
                            } else if (allInputs.length > 0) {
                                targetElement = allInputs[allInputs.length - 1];
                            }
                        }
                        
                        if (targetElement) {
                            if (typeof logInfo === 'function') {
                                logInfo(`🎯 Tentative ${delay}ms: Focus sur élément trouvé:`, targetElement);
                            }
                            targetElement.focus();
                            
                            // Forcer la sélection du texte
                            if (targetElement.select) targetElement.select();
                            if (targetElement.setSelectionRange) {
                                targetElement.setSelectionRange(0, targetElement.value.length);
                            }
                            
                            // Déclencher l'événement input pour s'assurer que Fabric.js détecte l'activité
                            targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                            targetElement.dispatchEvent(new Event('focus', { bubbles: true }));
                        } else {
                            if (typeof logInfo === 'function') {
                                logInfo(`🔍 Tentative ${delay}ms: Aucun élément de texte trouvé`);
                            }
                        }
                    }, delay);
                });
                
                // Ajouter un listener pour détecter la fin de l'édition
                const exitHandler = () => {
                    if (typeof logInfo === 'function') {
                        logInfo('📝 Fin de l\'édition de texte');
                    }
                    this.canvas.defaultCursor = this.tools[this.currentTool].cursor;
                    textObj.off('editing:exited', exitHandler);
                };
                
                textObj.on('editing:exited', exitHandler);
                
            }, 50);
            
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Erreur lors de l\'édition du texte:', error);
            }
        }
    }
    
    /**
     * Démarre le dessin libre
     */
    startFreeDrawing() {
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush.width = this.strokeWidth;
        this.canvas.freeDrawingBrush.color = this.currentColor;
    }
    
    /**
     * Arrête le dessin libre
     */
    stopFreeDrawing() {
        this.canvas.isDrawingMode = false;
    }
    
    /**
     * Change l'outil actuel
     */
    setTool(tool) {
        this.currentTool = tool;
        this.canvas.isDrawingMode = (tool === 'pen');
        this.canvas.selection = (tool === 'select');
        
        // Mettre à jour le curseur
        this.canvas.defaultCursor = this.tools[tool].cursor;
        
        // Mettre à jour l'interface
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        
        // Afficher/masquer les propriétés du texte
        const textProps = document.querySelector('.text-properties');
        textProps.style.display = (tool === 'text') ? 'block' : 'none';
    }
    
    /**
     * Change la couleur
     */
    setColor(color) {
        this.currentColor = color;
        
        // Mettre à jour l'interface
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const colorBtn = document.querySelector(`[data-color="${color}"]`);
        if (colorBtn) {
            colorBtn.classList.add('active');
        }
        
        // Appliquer à l'objet sélectionné
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            if (activeObject.type === 'i-text' || activeObject.type === 'text') {
                activeObject.set('fill', color);
            } else {
                activeObject.set('stroke', color);
            }
            this.canvas.renderAll();
        }
    }
    
    /**
     * Sauvegarde l'état pour l'historique
     */
    saveState() {
        if (this.historyStep < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyStep + 1);
        }
        
        this.history.push(JSON.stringify(this.canvas.toJSON()));
        this.historyStep = this.history.length - 1;
        
        // Limiter l'historique
        if (this.history.length > 50) {
            this.history = this.history.slice(-50);
            this.historyStep = this.history.length - 1;
        }
        
        this.updateHistoryButtons();
    }
    
    /**
     * Annuler
     */
    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.loadState(this.history[this.historyStep]);
        }
    }
    
    /**
     * Refaire
     */
    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.loadState(this.history[this.historyStep]);
        }
    }
    
    /**
     * Charge un état de l'historique
     */
    loadState(state) {
        this.canvas.loadFromJSON(state, () => {
            this.canvas.renderAll();
            this.updateHistoryButtons();
        });
    }
    
    /**
     * Met à jour les boutons d'historique
     */
    updateHistoryButtons() {
        document.getElementById('undoBtn').disabled = (this.historyStep <= 0);
        document.getElementById('redoBtn').disabled = (this.historyStep >= this.history.length - 1);
    }
    
    /**
     * Efface tout
     */
    clear() {
        this.canvas.clear();
        if (this.originalImage) {
            this.canvas.setBackgroundImage(this.originalImage, this.canvas.renderAll.bind(this.canvas));
        }
        this.saveState();
    }
    
    /**
     * Supprime l'objet sélectionné
     */
    deleteSelectedObject() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            this.canvas.remove(activeObject);
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
        } else {
            const activeGroup = this.canvas.getActiveObjects();
            if (activeGroup.length > 0) {
                activeGroup.forEach(obj => this.canvas.remove(obj));
                this.canvas.discardActiveObject();
                this.canvas.renderAll();
            }
        }
    }
    
    /**
     * Gère le zoom avec la molette de souris
     */
    handleMouseWheel(opt) {
        const e = opt.e;
        
        // Zoom seulement si Shift est pressé
        if (e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            
            const delta = e.deltaY;
            let zoom = this.canvas.getZoom();
            
            zoom *= 0.999 ** delta;
            
            // Calculer le zoom minimum basé sur la taille de l'image et du conteneur
            const minZoom = this.calculateMinZoom();
            
            // Limiter le zoom entre le minimum calculé et 5x
            zoom = Math.min(Math.max(zoom, minZoom), 5);
            
            // Zoomer vers le centre de l'image pour éviter qu'elle sorte du cadre
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            this.canvas.zoomToPoint({x: centerX, y: centerY}, zoom);
            
            // Mettre à jour l'affichage du niveau de zoom
            this.updateZoomDisplay();
            
            opt.e.preventDefault();
            opt.e.stopPropagation();
        }
    }
    
    /**
     * Met à jour l'affichage du niveau de zoom
     */
    updateZoomDisplay() {
        const zoom = this.canvas.getZoom();
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
        }
    }
    
    /**
     * Met à jour la visibilité du bouton de suppression
     */
    updateDeleteButtonVisibility() {
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) {
            const activeObject = this.canvas.getActiveObject();
            const activeObjects = this.canvas.getActiveObjects();
            
            if (activeObject || activeObjects.length > 0) {
                deleteBtn.style.display = 'block';
            } else {
                deleteBtn.style.display = 'none';
            }
        }
    }
    
    /**
     * Configure les événements clavier pour le canvas
     */
    setupCanvasKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // S'assurer que l'éditeur est ouvert
            if (!this.modal || !document.getElementById('imageEditorModal').classList.contains('show')) {
                return;
            }
            
            // Vérifier si on édite du texte - méthode plus robuste
            const activeObject = this.canvas.getActiveObject();
            const isEditingText = activeObject && activeObject.isEditing;
            
            // Vérifier aussi si on a un élément focusé qui ressemble à un champ de texte
            const focusedElement = document.activeElement;
            const isTextInputFocused = focusedElement && (
                focusedElement.tagName === 'TEXTAREA' || 
                (focusedElement.tagName === 'INPUT' && focusedElement.type === 'text') ||
                focusedElement.contentEditable === 'true'
            );
            
            if (typeof logInfo === 'function') {
                logInfo('⌨️ Touche:', e.key, 'Édition texte:', isEditingText, 'Input focusé:', isTextInputFocused);
            }
            
            // Si on édite du texte OU qu'un champ de texte a le focus, ne rien intercepter
            if (isEditingText || isTextInputFocused) {
                if (typeof logInfo === 'function') {
                    logInfo('📝 Mode édition texte actif - événement transmis à Fabric.js');
                }
                // Laisser passer TOUS les événements sans intervention
                return;
            }
            
            // Si on n'édite pas de texte, traiter les raccourcis
            switch(e.key) {
                case 'Delete':
                    e.preventDefault();
                    this.deleteSelectedObject();
                    break;
                case 'Escape':
                    this.canvas.discardActiveObject();
                    this.canvas.renderAll();
                    break;
                case 'Control':
                case 'Meta':
                    // Changer le curseur quand Ctrl est pressé
                    if (this.canvas.getZoom() > this.calculateMinZoom()) {
                        this.canvas.defaultCursor = 'grab';
                        this.canvas.hoverCursor = 'grab';
                    }
                    break;
            }
        });
        
        // Événements spéciaux pour l'édition de texte
        this.canvas.on('text:editing:entered', (e) => {
            if (typeof logInfo === 'function') {
                logInfo('🎯 Entrée en mode édition de texte');
            }
            // Désactiver complètement nos gestionnaires pendant l'édition
            this.textEditingActive = true;
        });
        
        this.canvas.on('text:editing:exited', (e) => {
            if (typeof logInfo === 'function') {
                logInfo('🎯 Sortie du mode édition de texte');
            }
            // Réactiver nos gestionnaires
            this.textEditingActive = false;
        });
        
        // Gestion du relâchement des touches
        document.addEventListener('keyup', (e) => {
            if (!this.modal || !document.getElementById('imageEditorModal').classList.contains('show')) {
                return;
            }
            
            if (e.key === 'Control' || e.key === 'Meta') {
                // Restaurer le curseur normal
                this.canvas.defaultCursor = this.tools[this.currentTool].cursor;
                this.canvas.hoverCursor = this.tools[this.currentTool].cursor;
            }
        });
    }
    
    /**
     * Zoom in
     */
    zoomIn() {
        let zoom = this.canvas.getZoom();
        zoom = Math.min(zoom * 1.2, 5);
        this.canvas.setZoom(zoom);
        this.updateZoomDisplay();
    }
    
    /**
     * Zoom out
     */
    zoomOut() {
        let zoom = this.canvas.getZoom();
        const minZoom = this.calculateMinZoom();
        zoom = Math.max(zoom / 1.2, minZoom);
        this.canvas.setZoom(zoom);
        this.updateZoomDisplay();
    }
    
    /**
     * Calcule le zoom minimum pour ne pas dépasser la taille originale de l'image
     */
    calculateMinZoom() {
        if (!this.originalImage) {
            return 0.1; // Valeur par défaut si pas d'image
        }
        
        const containerWidth = document.querySelector('.canvas-wrapper').clientWidth - 40;
        const containerHeight = document.querySelector('.canvas-wrapper').clientHeight - 40;
        
        // Calculer le zoom qui fait tenir l'image dans le conteneur
        const scaleX = containerWidth / this.originalImage.width;
        const scaleY = containerHeight / this.originalImage.height;
        const fitScale = Math.min(scaleX, scaleY);
        
        // Le zoom minimum est soit le zoom "fit", soit 1.0 (taille originale), selon ce qui est le plus petit
        return Math.min(fitScale, 1.0);
    }
    
    /**
     * Ajuster à l'écran
     */
    fitToScreen() {
        if (this.originalImage) {
            const containerWidth = document.querySelector('.canvas-wrapper').clientWidth - 40;
            const containerHeight = document.querySelector('.canvas-wrapper').clientHeight - 40;
            
            const scaleX = containerWidth / this.originalImage.width;
            const scaleY = containerHeight / this.originalImage.height;
            const scale = Math.min(scaleX, scaleY, 1);
            
            this.canvas.setZoom(scale);
            this.canvas.setWidth(this.originalImage.width * scale);
            this.canvas.setHeight(this.originalImage.height * scale);
            this.updateZoomDisplay();
        }
    }
    
    /**
     * Affiche le modal de confirmation de sauvegarde
     */
    showSaveConfirmation() {
        const saveModal = new bootstrap.Modal(document.getElementById('saveConfirmModal'));
        saveModal.show();
    }
    
    /**
     * Sauvegarde l'image éditée
     */
    async saveImage(replaceOriginal = false) {
        try {
            if (typeof logInfo === 'function') {
                logInfo('🚀 Début de la sauvegarde...');
            }
            
            // Générer l'image
            const dataURL = this.canvas.toDataURL({
                format: 'png',
                quality: 1.0
            });
            
            if (typeof logInfo === 'function') {
                logInfo('📸 Image générée, envoi au serveur...');
            }
            
            // Envoyer au serveur
            const response = await fetch('/api/save-edited-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    original_filename: this.currentImageData.filename,
                    document_name: appState.documentName,
                    edited_image_data: dataURL,
                    replace_original: replaceOriginal
                })
            });
            
            if (typeof logInfo === 'function') {
                logInfo('📡 Réponse serveur reçue:', response.status);
            }
            
            if (response.ok) {
                const result = await response.json();
                if (typeof logInfo === 'function') {
                    logInfo('✅ Image sauvegardée:', result);
                }
                
                const action = replaceOriginal ? 'remplacée' : 'créée';
                this.showSuccess(`Image ${action} avec succès !`);
                
                // Fermer immédiatement et proprement toutes les modales
                this.closeAllModalsAndCleanup();
                
                // Mettre à jour l'interface immédiatement
                this.updateMainInterface(result.filename, replaceOriginal);
                
            } else {
                const errorText = await response.text();
                if (typeof logError === 'function') {
                    logError('❌ Erreur serveur:', response.status, errorText);
                }
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Erreur sauvegarde:', error);
            }
            this.showError(`Erreur lors de la sauvegarde: ${error.message}`);
        }
    }
    
    /**
     * Ferme toutes les modales et nettoie les backdrops
     */
    closeAllModalsAndCleanup() {
        if (typeof logInfo === 'function') {
            logInfo('🧹 Nettoyage complet des modales...');
        }
        
        // Fermer toutes les modales Bootstrap ouvertes
        document.querySelectorAll('.modal.show').forEach(modal => {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
            }
        });
        
        // Fermer notre modal d'éditeur
        if (this.modal) {
            this.modal.hide();
        }
        
        // Forcer le nettoyage des backdrops après un délai court
        setTimeout(() => {
            // Supprimer tous les backdrops qui pourraient persister
            document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                backdrop.remove();
            });
            
            // S'assurer que le body n'a plus les classes de modal
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
            if (typeof logInfo === 'function') {
                logInfo('✅ Nettoyage modal terminé');
            }
        }, 100);
    }
    
    /**
     * Met à jour l'interface principale après sauvegarde
     */
    updateMainInterface(newFilename, replaceOriginal = false) {
        if (typeof logInfo === 'function') {
            logInfo('🔄 Début mise à jour interface:', newFilename, 'remplacer:', replaceOriginal);
        }
        
        // Vérifier que nous avons les données nécessaires
        if (!this.currentImageData || !this.currentImageData.filename) {
            if (typeof logError === 'function') {
                logError('❌ Données d\'image manquantes');
            }
            this.handleUpdateFailure();
            return;
        }
        
        try {
            if (replaceOriginal) {
                // Mode remplacement : mettre à jour l'image existante
                const success = this.updateImageInDOM(this.currentImageData.filename, newFilename);
                if (!success) {
                    this.handleUpdateFailure();
                    return;
                }
                
                // Mettre à jour aussi extractedImages pour la cohérence
                this.updateExtractedImagesArray(this.currentImageData.filename, newFilename, true);
                
            } else {
                // Mode création : ajouter la nouvelle image à côté de l'originale
                const success = this.addNewImageToDOM(newFilename, this.currentImageData.filename);
                if (!success) {
                    this.handleUpdateFailure();
                    return;
                }
                
                // Ajouter la nouvelle image à extractedImages
                this.updateExtractedImagesArray(this.currentImageData.filename, newFilename, false);
                
                // Ajouter la nouvelle image à la même section que l'originale
                this.addNewImageToSameSection(newFilename, this.currentImageData.filename);
                
                // Mettre à jour seulement les statistiques (pas updateUnassignedImages qui re-rendrait tout)
                if (typeof updateStats === 'function') {
                    updateStats();
                }
            }
            
            if (typeof logInfo === 'function') {
                logInfo('✅ Interface mise à jour avec succès');
            }
            
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Erreur lors de la mise à jour de l\'interface:', error);
            }
            this.handleUpdateFailure();
        }
    }
    
    /**
     * Met à jour le tableau extractedImages pour maintenir la cohérence
     */
    updateExtractedImagesArray(originalFilename, newFilename, replaceOriginal) {
        if (typeof logInfo === 'function') {
            logInfo('[DIAGNOSTIC] updateExtractedImagesArray appelée:', {
                originalFilename,
                newFilename,
                replaceOriginal,
                extractedImagesLength: typeof extractedImages !== 'undefined' ? extractedImages.length : 'undefined'
            });
        }
        
        try {
            if (typeof extractedImages !== 'undefined' && Array.isArray(extractedImages)) {
                if (replaceOriginal) {
                    // Mode remplacement : modifier le nom de fichier existant
                    const index = extractedImages.findIndex(img => img.filename === originalFilename);
                    if (typeof logInfo === 'function') {
                        logInfo('[DIAGNOSTIC] Index de l\'image originale dans extractedImages:', index);
                    }
                    if (index !== -1) {
                        const oldFilename = extractedImages[index].filename;
                        extractedImages[index].filename = newFilename;
                        if (typeof logInfo === 'function') {
                            logInfo('[DIAGNOSTIC] extractedImages mis à jour (remplacement):', oldFilename, '->', newFilename);
                        }
                    }
                } else {
                    // Mode création : ajouter une nouvelle entrée
                    const originalIndex = extractedImages.findIndex(img => img.filename === originalFilename);
                    if (typeof logInfo === 'function') {
                        logInfo('[DIAGNOSTIC] Index de l\'image originale pour clonage:', originalIndex);
                    }
                    if (originalIndex !== -1) {
                        const originalImage = extractedImages[originalIndex];
                        const newImage = { ...originalImage, filename: newFilename };
                        
                        // Vérifier si l'image existe déjà
                        const existingIndex = extractedImages.findIndex(img => img.filename === newFilename);
                        if (existingIndex !== -1) {
                            if (typeof logInfo === 'function') {
                                logInfo('[DIAGNOSTIC] Image déjà présente dans extractedImages, éviter duplication:', newFilename);
                            }
                            return;
                        }
                        
                        extractedImages.splice(originalIndex + 1, 0, newImage);
                        if (typeof logInfo === 'function') {
                            logInfo('[DIAGNOSTIC] extractedImages mis à jour (nouvelle image ajoutée):', newFilename);
                            logInfo('[DIAGNOSTIC] extractedImages length après ajout:', extractedImages.length);
                        }
                    }
                }
            }
        } catch (error) {
            if (typeof logWarn === 'function') {
                logWarn('[DIAGNOSTIC] Impossible de mettre à jour extractedImages:', error);
            }
        }
    }
    
    /**
     * Ajoute une nouvelle image dans le DOM (mode création)
     */
    addNewImageToDOM(newFilename, originalFilename) {
        console.log(`[DIAGNOSTIC] addNewImageToDOM appelée: ${newFilename} <- ${originalFilename} à ${new Date().toISOString()}`);
        
        const originalCard = document.querySelector(`[data-image-filename="${originalFilename}"]`);
        if (!originalCard) {
            console.error(`[DIAGNOSTIC] Image card originale non trouvée pour: ${originalFilename}`);
            return false;
        }
        
        // Vérifier si une carte avec ce nom existe déjà
        const existingCard = document.querySelector(`[data-image-filename="${newFilename}"]`);
        if (existingCard) {
            console.warn(`[DIAGNOSTIC] Une carte avec ce nom existe déjà, éviter la duplication: ${newFilename}`);
            return true; // Retourner true pour éviter l'erreur, mais ne pas créer de doublon
        }
        
        try {
            console.debug(`[DIAGNOSTIC] Clonage de la carte originale pour ${newFilename}...`);
            
            // Cloner la carte de l'image originale
            const newCard = originalCard.cloneNode(true);
            
            // Mettre à jour les attributs de la nouvelle carte
            newCard.setAttribute('data-image-filename', newFilename);
            newCard.setAttribute('onclick', `toggleImageSelectionByClick('${newFilename}')`);
            newCard.classList.remove('selected'); // S'assurer que la nouvelle image n'est pas pré-sélectionnée
            
            // Mettre à jour l'image src
            const imgElement = newCard.querySelector('img');
            if (imgElement) {
                const documentName = (typeof appState !== 'undefined' && appState.documentName) 
                    ? appState.documentName 
                    : this.currentImageData.document_name;
                const newSrc = `/image/${documentName}/${newFilename}?t=${Date.now()}`;
                imgElement.src = newSrc;
                imgElement.alt = newFilename;
                console.debug(`[DIAGNOSTIC] Image src mise à jour: ${newSrc}`);
            }
            
            // Mettre à jour tous les boutons d'action avec les bons paramètres
            const zoomBtn = newCard.querySelector('.btn-zoom');
            if (zoomBtn) {
                zoomBtn.setAttribute('onclick', `showImagePreview('${newFilename}', event)`);
            }
            
            const assignBtn = newCard.querySelector('.btn-assign');
            if (assignBtn) {
                assignBtn.setAttribute('onclick', `showSectionSelector('${newFilename}', event)`);
            }
            
            const deleteBtn = newCard.querySelector('.btn-image-delete');
            if (deleteBtn) {
                deleteBtn.setAttribute('onclick', `deleteImage('${newFilename}', event)`);
            }
            
            // Mettre à jour le nom du fichier affiché (il sera généré selon la section)
            const filenameElement = newCard.querySelector('.image-filename');
            if (filenameElement) {
                // Le nom affiché sera mis à jour par renderSections()
                filenameElement.textContent = newFilename;
            }
            
            // Ajouter un indicateur "Nouvelle"
            newCard.style.border = '3px solid #10B981';
            const badge = document.createElement('div');
            badge.className = 'position-absolute top-0 start-0 bg-success text-white px-2 py-1 rounded-end';
            badge.style.cssText = 'font-size: 0.75rem; z-index: 10;';
            badge.innerHTML = '<i class="fas fa-plus me-1"></i>Nouvelle';
            newCard.style.position = 'relative';
            newCard.prepend(badge);
            
            // Insérer la nouvelle carte après l'originale
            originalCard.parentNode.insertBefore(newCard, originalCard.nextSibling);
            
            // Compter les cartes après insertion
            const cardsWithSameName = document.querySelectorAll(`[data-image-filename="${newFilename}"]`).length;
            
            console.log(`[DIAGNOSTIC] Nouvelle image ajoutée à la grille: ${newFilename}`);
            console.log(`[DIAGNOSTIC] Cartes avec ce nom après ajout: ${cardsWithSameName}`);
            
            // Supprimer le badge après quelques secondes
            setTimeout(() => {
                if (badge.parentNode) {
                    badge.remove();
                }
                newCard.style.border = '';
            }, 5000);
            
            return true;
        } catch (error) {
            console.error(`[DIAGNOSTIC] Erreur lors de l'ajout de la nouvelle image: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Ajoute la nouvelle image à la même section que l'image originale
     */
    addNewImageToSameSection(newFilename, originalFilename) {
        if (typeof logInfo === 'function') {
            logInfo(`🏗️ [DIAGNOSTIC] addNewImageToSameSection appelée: ${newFilename}, ${originalFilename}, ${typeof appState !== 'undefined' ? appState.sections.length : 'undefined'}`);
        }
        
        try {
            if (typeof appState !== 'undefined' && appState.sections) {
                // Trouver la section qui contient l'image originale
                for (let section of appState.sections) {
                    const originalImageIndex = section.images.findIndex(img => img.filename === originalFilename);
                    if (originalImageIndex !== -1) {
                        if (typeof logInfo === 'function') {
                            logInfo(`🔍 [DIAGNOSTIC] Image originale trouvée dans section: ${section.sectionNumber || section.number} à l'index: ${originalImageIndex}`);
                        }
                        
                        // Vérifier si la nouvelle image existe déjà dans cette section
                        const existingIndex = section.images.findIndex(img => img.filename === newFilename);
                        if (existingIndex !== -1) {
                            if (typeof logInfo === 'function') {
                                logInfo(`⚠️ [DIAGNOSTIC] Image déjà présente dans la section, éviter duplication: ${newFilename}`);
                            }
                            return;
                        }
                        
                        // Trouver la nouvelle image dans extractedImages
                        const newImage = extractedImages.find(img => img.filename === newFilename);
                        if (newImage) {
                            // Ajouter la nouvelle image juste après l'originale dans la section
                            section.images.splice(originalImageIndex + 1, 0, newImage);
                            if (typeof logInfo === 'function') {
                                logInfo(`✅ [DIAGNOSTIC] Nouvelle image "${newFilename}" ajoutée à la section ${section.sectionNumber || section.number}`);
                                logInfo('📊 [DIAGNOSTIC] Section images count après ajout:', section.images.length);
                            }
                        } else {
                            if (typeof logWarn === 'function') {
                                logWarn(`⚠️ [DIAGNOSTIC] Nouvelle image non trouvée dans extractedImages: ${newFilename}`);
                            }
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            if (typeof logWarn === 'function') {
                logWarn(`⚠️ [DIAGNOSTIC] Impossible d'ajouter la nouvelle image à la section: ${error.message}`);
            }
        }
    }
    
    /**
     * Gère l'échec de mise à jour de l'interface
     */
    handleUpdateFailure() {
        if (typeof logWarn === 'function') {
            logWarn('⚠️ Activation du mode de refresh automatique');
        }
        
        // Au lieu de demander à l'utilisateur, rafraîchir automatiquement
        // en préservant l'état de la page
        this.refreshPagePreservingState();
    }
    
    /**
     * Rafraîchit la page en préservant l'état
     */
    refreshPagePreservingState() {
        if (typeof logInfo === 'function') {
            logInfo('⚠️ Mise à jour DOM échouée, tentative de récupération...');
        }
        
        // Au lieu de recharger, essayons de forcer une mise à jour via l'API
        this.forceImageRefresh();
    }
    
    /**
     * Force le rechargement des images via l'API
     */
    async forceImageRefresh() {
        try {
            if (typeof logInfo === 'function') {
                logInfo('🔄 Tentative de refresh via API...');
            }
            
            // Obtenir la liste des images via l'API
            const documentName = (typeof appState !== 'undefined' && appState.documentName) 
                ? appState.documentName 
                : this.currentImageData.document_name;
                
            const response = await fetch(`/api/images/${documentName}`);
            if (response.ok) {
                const images = await response.json();
                if (typeof logInfo === 'function') {
                    logInfo('📡 Liste d\'images récupérée:', images.length, 'images');
                }
                
                // Recharger toutes les images dans le DOM
                this.refreshAllImagesInDOM(images);
                
                this.showSuccess('Images mises à jour avec succès !');
            } else {
                throw new Error('Impossible de récupérer la liste des images');
            }
            
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Échec du refresh API:', error);
            }
            
            // En dernier recours, proposer à l'utilisateur de naviguer vers une nouvelle URL
            this.showRecoveryOptions();
        }
    }
    
    /**
     * Rafraîchit toutes les images dans le DOM
     */
    refreshAllImagesInDOM(images) {
        if (typeof logInfo === 'function') {
            logInfo('🖼️ Refresh de toutes les images dans le DOM');
        }
        
        images.forEach(imageInfo => {
            const imageCard = document.querySelector(`[data-image-filename="${imageInfo.filename}"]`);
            if (imageCard) {
                const imgElement = imageCard.querySelector('img');
                if (imgElement) {
                    // Forcer le rechargement avec timestamp
                    const imagePath = imgElement.src.split('?')[0];
                    imgElement.src = `${imagePath}?t=${Date.now()}`;
                }
            }
        });
    }
    
    /**
     * Affiche les options de récupération à l'utilisateur
     */
    showRecoveryOptions() {
        const message = `
            L'image a été sauvegardée avec succès sur le serveur, 
            mais l'interface n'a pas pu être mise à jour automatiquement.
            
            Que souhaitez-vous faire ?
        `;
        
        // Créer un modal de récupération personnalisé
        this.showRecoveryModal(message);
    }
    
    /**
     * Affiche un modal de récupération avec options
     */
    showRecoveryModal(message) {
        // Créer le modal HTML
        const modalHTML = `
            <div class="modal fade" id="recoveryModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content" style="background: var(--dark-blue, #0f172a); border: 1px solid rgba(59, 130, 246, 0.3);">
                        <div class="modal-header" style="border-bottom: 1px solid rgba(59, 130, 246, 0.2);">
                            <h5 class="modal-title" style="color: white;">
                                <i class="fas fa-sync-alt me-2"></i>
                                Mise à jour requise
                            </h5>
                        </div>
                        <div class="modal-body" style="color: rgba(255, 255, 255, 0.9);">
                            <p>${message}</p>
                            <div class="d-grid gap-2">
                                <button type="button" class="btn btn-primary" onclick="window.location.href = window.location.pathname">
                                    <i class="fas fa-refresh me-2"></i>
                                    Recharger l'interface (recommandé)
                                </button>
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times me-2"></i>
                                    Continuer sans mise à jour
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter le modal au DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Afficher le modal
        const modal = new bootstrap.Modal(document.getElementById('recoveryModal'));
        modal.show();
        
        // Nettoyer après fermeture
        document.getElementById('recoveryModal').addEventListener('hidden.bs.modal', function () {
            this.remove();
        });
    }
    
    /**
     * Met à jour les données globales de l'application
     */
    updateGlobalImageState(newFilename, replaceOriginal) {
        try {
            // Ne pas modifier extractedImages car c'est la liste originale du serveur
            // extractedImages ne devrait jamais être modifié côté client
            
            if (typeof logInfo === 'function') {
                logInfo('ℹ️ Données globales non modifiées (extractedImages est la liste originale du serveur)');
            }
            
        } catch (error) {
            if (typeof logWarn === 'function') {
                logWarn('⚠️ Impossible de mettre à jour l\'état global:');
            }
        }
    }
    
    /**
     * Met à jour une image existante dans le DOM
     */
    updateImageInDOM(originalFilename, newFilename) {
        console.log(`[ImageEditor] updateImageInDOM: Remplacer ${originalFilename} par ${newFilename}`);
        
        const imageCard = document.querySelector(`[data-image-filename="${originalFilename}"]`);
        if (!imageCard) {
            console.error(`[ImageEditor] updateImageInDOM: Image card non trouvée pour (original): ${originalFilename}`);
            // Essayer de trouver avec le nouveau nom si jamais elle a déjà été mise à jour partiellement
            const alreadyUpdatedCard = document.querySelector(`[data-image-filename="${newFilename}"]`);
            if (alreadyUpdatedCard) {
                console.warn(`[ImageEditor] updateImageInDOM: La carte semble déjà mise à jour avec ${newFilename}`);
                // On pourrait forcer le re-rendu de cette carte spécifique si nécessaire
                const imgElement = alreadyUpdatedCard.querySelector('img');
                if (imgElement) {
                    const imagePath = imgElement.src.split('?')[0];
                    imgElement.src = `${imagePath.replace(originalFilename, newFilename)}?t=${Date.now()}`;
                }
                return true;
            }
            return false;
        }
        
        // Trouver l'élément img dans la carte
        const imgElement = imageCard.querySelector('img');
        if (!imgElement) {
            console.error('[ImageEditor] updateImageInDOM: Élément img non trouvé dans la carte');
            return false;
        }
        
        try {
            // 1. Mettre à jour l'attribut data-image-filename de la carte
            imageCard.setAttribute('data-image-filename', newFilename);
            console.log(`[ImageEditor] updateImageInDOM: data-image-filename mis à jour à ${newFilename}`);

            // 2. Mettre à jour l'image src avec timestamp
            const oldImageSrc = imgElement.src;
            const baseSrc = oldImageSrc.substring(0, oldImageSrc.lastIndexOf('/') + 1);
            const newImageSrc = `${baseSrc}${newFilename}?t=${Date.now()}`;
            imgElement.src = newImageSrc;
            imgElement.alt = newFilename;
            console.log(`[ImageEditor] updateImageInDOM: img.src mis à jour à ${newImageSrc} (depuis ${oldImageSrc})`);

            // 3. Mettre à jour l'attribut onclick de la carte pour la sélection
            imageCard.setAttribute('onclick', `toggleImageSelectionByClick('${newFilename}')`);

            // 4. Mettre à jour tous les boutons d'action avec les bons paramètres
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

            // 5. Mettre à jour le nom du fichier affiché dans .image-filename
            // Ce nom sera ensuite recalculé par generateFilename lors du prochain renderSections,
            // mais pour une màj immédiate, on met le nouveau nom de base.
            const filenameElement = imageCard.querySelector('.image-filename');
            if (filenameElement) {
                filenameElement.textContent = newFilename; 
            }
            
            console.log(`[ImageEditor] updateImageInDOM: Carte image pour ${newFilename} entièrement mise à jour.`);
            
            // Ajouter un effet visuel pour montrer que l'image a été mise à jour
            imageCard.style.border = '3px solid #059669'; // Vert pour remplacement
            setTimeout(() => {
                imageCard.style.border = '';
            }, 2000);
            
            return true;
        } catch (error) {
            console.error('[ImageEditor] updateImageInDOM: Erreur lors de la mise à jour des attributs de la carte:', error);
            return false;
        }
    }
    
    /**
     * Met à jour l'interface utilisateur
     */
    updateUI() {
        // Mettre à jour les valeurs des contrôles
        document.getElementById('strokeWidth').value = this.strokeWidth;
        document.getElementById('strokeWidthValue').textContent = `${this.strokeWidth}px`;
        
        document.getElementById('opacity').value = this.opacity * 100;
        document.getElementById('opacityValue').textContent = `${Math.round(this.opacity * 100)}%`;
        
        this.updateHistoryButtons();
    }
    
    /**
     * Initialise les événements
     */
    initEventListeners() {
        const runSetup = () => {
            console.log("[DIAGNOSTIC] runSetup pour les listeners appelé.");
            if (!this._eventListenersInitialized) {
                this.setupEventListeners();
            } else {
                console.warn("[DIAGNOSTIC] runSetup: Listeners déjà initialisés, skip setupEventListeners.");
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runSetup);
        } else {
            runSetup(); // DOM déjà 'interactive' ou 'complete'
        }
    }
    
    setupEventListeners() {
        if (this._eventListenersInitialized) {
            console.warn("[DIAGNOSTIC] setupEventListeners: Déjà initialisé. Skip.");
            return;
        }
        console.log("[DIAGNOSTIC] Initializing event listeners for ImageEditor...");

        // Outils
        document.addEventListener('click', (e) => {
            if (e.target.matches('.toolbar-btn[data-tool]')) {
                this.setTool(e.target.dataset.tool);
            }
        });
        
        // Couleurs
        document.addEventListener('click', (e) => {
            if (e.target.matches('.color-btn[data-color]')) {
                this.setColor(e.target.dataset.color);
            }
        });
        
        // Couleur personnalisée
        const colorPicker = document.getElementById('customColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                this.setColor(e.target.value);
            });
        }
        
        // Propriétés
        const strokeWidth = document.getElementById('strokeWidth');
        if (strokeWidth) {
            strokeWidth.addEventListener('input', (e) => {
                this.strokeWidth = parseInt(e.target.value);
                document.getElementById('strokeWidthValue').textContent = `${this.strokeWidth}px`;
            });
        }
        
        const opacity = document.getElementById('opacity');
        if (opacity) {
            opacity.addEventListener('input', (e) => {
                this.opacity = parseInt(e.target.value) / 100;
                document.getElementById('opacityValue').textContent = `${Math.round(this.opacity * 100)}%`;
            });
        }
        
        // Actions
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undo());
        }
        
        const redoBtn = document.getElementById('redoBtn');
        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.redo());
        }
        
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedObject());
        }
        
        const saveBtn = document.getElementById('saveEditBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.showSaveConfirmation());
        }
        
        // Événements du modal de confirmation
        const replaceBtn = document.getElementById('replaceOriginalBtn');
        if (replaceBtn) {
            replaceBtn.addEventListener('click', () => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('saveConfirmModal'));
                if (modal) modal.hide();
                this.saveImage(true); // Remplacer l'original
            });
        }
        
        const createNewBtn = document.getElementById('createNewBtn');
        if (createNewBtn) {
            createNewBtn.addEventListener('click', () => {
                console.log("[DIAGNOSTIC] createNewBtn clicked!");
                const modal = bootstrap.Modal.getInstance(document.getElementById('saveConfirmModal'));
                if (modal) modal.hide();
                this.saveImage(false); // Créer une nouvelle image
            });
        }
        
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeEditor());
        }
        
        // Boutons de zoom
        const zoomInBtn = document.getElementById('zoomInBtn');
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        
        const fitToScreenBtn = document.getElementById('fitToScreenBtn');
        if (fitToScreenBtn) {
            fitToScreenBtn.addEventListener('click', () => this.fitToScreen());
        }

        this._eventListenersInitialized = true;
        console.log("[DIAGNOSTIC] Event listeners initialized.");
    }
    
    /**
     * Affiche un message de succès
     */
    showSuccess(message) {
        if (typeof logInfo === 'function') {
            logInfo('✅', message);
        }
        
        // Créer une notification toast simple
        this.showToast(message, 'success');
    }
    
    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        if (typeof logError === 'function') {
            logError('❌', message);
        }
        
        // Créer une notification toast simple
        this.showToast(message, 'error');
    }
    
    /**
     * Affiche une notification toast
     */
    showToast(message, type = 'info') {
        // Créer l'élément toast
        const toast = document.createElement('div');
        toast.className = `alert alert-${type === 'success' ? 'success' : 'danger'} position-fixed`;
        toast.style.cssText = `
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            max-width: 500px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        `;
        toast.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
                ${message}
            </div>
        `;
        
        // Ajouter au document
        document.body.appendChild(toast);
        
        // Déterminer la durée d'affichage selon le type de message
        const duration = message.includes('nouvelle image sera visible') ? 8000 : 3000;
        
        // Supprimer après la durée déterminée
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, duration);
    }
    
    /**
     * Ferme l'éditeur (pour le bouton annuler)
     */
    closeEditor() {
        if (typeof logInfo === 'function') {
            logInfo('🚪 Fermeture de l\'éditeur...');
        }
        
        // Nettoyer toutes les modales
        this.closeAllModalsAndCleanup();
        
        // Nettoyer les ressources
        if (this.canvas) {
            this.canvas.dispose();
            this.canvas = null;
        }
        
        this.currentImageData = null;
        
        if (typeof logInfo === 'function') {
            logInfo('✅ Éditeur fermé');
        }
    }
}

// Instance globale de l'éditeur
window.imageEditor = new ImageEditor();

// Fonction globale pour ouvrir l'éditeur (appelée depuis results.html)
window.openImageEditor = function(filename, imageData = null) {
    window.imageEditor.openEditor(filename, imageData);
};

console.log('📝 Image Editor chargé et prêt'); 