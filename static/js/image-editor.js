/**
 * DocuLens Image Editor
 * Éditeur d'images intégré pour l'annotation de documentation technique
 */

class ImageEditor {
    constructor() {
        this.canvas = null;
        this.originalImage = null; // Objet Fabric Image de l'image de fond
        this.currentTool = 'select';
        
        // Propriétés par défaut pour les nouveaux objets et l'UI
        this.currentColor = '#FF0000';
        this.currentStrokeWidth = 3; // Augmenté à 3 pour éviter l'invisibilité
        this.currentOpacity = 1;
        this.currentFontFamily = 'Arial';
        this.currentFontSize = 16;
        // Pas besoin de stocker fontWeight, fontStyle, underline ici, 
        // car ils seront lus/appliqués directement depuis/vers l'objet.

        // Propriétés pour le nouveau système de zoom/pan
        this.currentCanvasScale = 1.0; // Échelle actuelle du canvas HTML et de son contenu
        this.baseCanvasWidth = 0;      // Largeur "naturelle" (scale 1.0) de l'image chargée
        this.baseCanvasHeight = 0;     // Hauteur "naturelle" (scale 1.0) de l'image chargée
        this.canvasWrapper = null;     // Référence au div .canvas-wrapper
        this.MIN_CANVAS_SCALE = 0.1;   // Échelle minimale autorisée
        this.MAX_CANVAS_SCALE = 5.0;    // Échelle maximale autorisée
        
        // Mode de redimensionnement du canvas
        this.isCanvasResizeMode = false;
        this.previousTool = null;
        this.canvasBorder = null;
        this.resizeHandles = [];
        
        // Mode d'annotation à deux étapes
        this.isCreatingAnnotation = false;
        this.tempAnnotationBox = null;

        this.history = [];
        this.historyStep = 0;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.tempObject = null; // Pour le dessin de formes temporaires
        this.suppressSaveStateForTempObject = false; // Pour optimiser saveState lors du dessin
        this.modal = null;
        this.currentImageData = null;
        this.layerIdCounter = 0; // Pour les ID uniques des calques
        
        this.tools = {
            select: { cursor: 'default' },
            rectangle: { cursor: 'crosshair' },
            circle: { cursor: 'crosshair' },
            arrow: { cursor: 'crosshair' },
            line: { cursor: 'crosshair' },
            text: { cursor: 'text' },
            pen: { cursor: 'crosshair' },
            annotation: { cursor: 'crosshair' }
        };
        
        this.layers = [];
        this.currentLayer = null;
        
        this._eventListenersInitialized = false;
        this.initEventListeners();
        
        // Propriétés pour la fusion d'images
        this.mergedImages = []; // Stockage des images fusionnées
        this.mergeModalInitialized = false;
        this.tempAvailableImages = []; // Stockage temporaire des images disponibles pour la modal
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
        
        if (typeof fabric === 'undefined') {
            await this.loadFabricJS();
        }

        this.canvasWrapper = document.querySelector('.canvas-wrapper');
        if (!this.canvasWrapper) {
            console.error("FATAL: .canvas-wrapper element not found!");
            this.showError("Erreur critique: Conteneur du canvas manquant.");
            return;
        }
        
        const canvasElement = document.getElementById('imageEditorCanvas');
        this.canvas = new fabric.Canvas(canvasElement, {
            // Les dimensions initiales seront définies dans loadImage via applyCanvasScaleAndObjects
            backgroundColor: '#ffffff', // Fond blanc
            selection: true,
            preserveObjectStacking: true,
            zoom: 1 // Le zoom interne de Fabric.js reste à 1
        });
        
        // Événements du canvas
        this.canvas.on('mouse:down', (e) => this.onMouseDown(e));
        this.canvas.on('mouse:move', (e) => this.onMouseMove(e));
        this.canvas.on('mouse:up', (e) => this.onMouseUp(e));
        
        // Variables pour le panning
        this.isPanning = false;
        this.lastPanPoint = null;
        this.canvas.on('object:added', (e) => {
            if (e.target && !e.target.id) {
                e.target.id = `layer_${this.layerIdCounter++}`;
            }
            // Optimisation: Ne pas sauvegarder l'état pour les objets temporaires pendant le dessin
            if (this.suppressSaveStateForTempObject && e.target === this.tempObject) {
                this.renderLayersUI(); // Mettre à jour la liste des calques pour le retour visuel
                return;
            }
            this.saveState();
            this.renderLayersUI(); 
        });
        this.canvas.on('object:removed', (e) => {
            // Optimisation: Ne pas sauvegarder l'état pour les objets temporaires pendant le dessin
            if (this.suppressSaveStateForTempObject && e.target === this.tempObject) {
                this.renderLayersUI(); // Mettre à jour la liste des calques pour le retour visuel
                return;
            }
            this.saveState();
            this.renderLayersUI(); 
        });
        this.canvas.on('object:modified', (e) => {
            this.saveState();
            this.renderLayersUI(); 
            this.updatePropertiesFromActiveObject(); // Mettre à jour l'UI si l'objet modifié est l'actif
        });
        
        // Gestion du zoom avec la molette + Shift
        this.canvas.on('mouse:wheel', (opt) => this.handleMouseWheel(opt));
        
        // Gestion des touches de clavier
        this.setupCanvasKeyboardEvents();
        
        // Gestion de la sélection d'objets
        this.canvas.on('selection:created', (e) => {
            this.updateDeleteButtonVisibility();
            this.updatePropertiesFromActiveObject(); // Mettre à jour les propriétés depuis la nouvelle sélection
            this.renderLayersUI(); 
        });
        this.canvas.on('selection:updated', (e) => {
            this.updateDeleteButtonVisibility();
            this.updatePropertiesFromActiveObject(); // Mettre à jour les propriétés
            this.renderLayersUI(); 
        });
        this.canvas.on('selection:cleared', (e) => {
            this.updateDeleteButtonVisibility();
            this.updatePropertiesFromActiveObject(); // Remettre les propriétés à l'état par défaut
            this.renderLayersUI(); 
        });
        
        // Initialiser l'historique
        this.saveState();
        this.renderLayersUI(); 
        this.updatePropertiesFromActiveObject(); // Initialiser l'UI des propriétés
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
            if (filename === 'test.jpg') {
                // Cas de test simplifié (pourrait aussi utiliser la nouvelle logique)
                this.baseCanvasWidth = 800;
                this.baseCanvasHeight = 600;
                this.currentCanvasScale = 1.0;
                this.originalImage = null; // Pas d'image de fond réelle pour le test
                this.applyCanvasScaleAndObjects(1.0); // Appliquer l'échelle initiale
                this.canvas.backgroundColor = '#ffffff';
                document.getElementById('editorImageName').textContent = `- ${filename}`;
                this.updateZoomDisplay();
                resolve();
                return;
            }
            
            const imagePath = `/image/${appState.documentName}/${filename}?t=${Date.now()}`;
            
            fabric.Image.fromURL(imagePath, (img) => {
                if (!img) {
                    reject(new Error(`Impossible de charger l'image: ${imagePath}`));
                    return;
                }
                
                this.originalImage = img; // Stocker l'objet image Fabric
                this.originalImage.set({
                    selectable: false, // L'image de fond n'est pas sélectionnable
                    evented: false,    // Ni source d'événements
                    originX: 'left',
                    originY: 'top',
                    isOriginalImage: true // Marquer comme image originale
                });

                this.baseCanvasWidth = img.width;  // Dimensions natives de l'image
                this.baseCanvasHeight = img.height;

                // Calculer l'échelle initiale pour adapter l'image au conteneur sans l'agrandir
                const PADDING = 10; // Un peu de marge dans le wrapper
                const availableWidth = this.canvasWrapper.clientWidth - PADDING;
                const availableHeight = this.canvasWrapper.clientHeight - PADDING;
                
                const fitScale = Math.min(
                    availableWidth / this.baseCanvasWidth,
                    availableHeight / this.baseCanvasHeight,
                    1.0 // Ne pas agrandir l'image au-delà de sa taille native pour l'adapter initialement
                );
                this.currentCanvasScale = fitScale;
                
                this.canvas.setZoom(1); // S'assurer que le zoom interne de Fabric est à 1

                // Ajouter l'image au canvas comme objet (pas comme fond)
                this.canvas.add(this.originalImage);
                this.canvas.sendToBack(this.originalImage);
                
                // Appliquer l'échelle
                this.applyCanvasScaleAndObjects(1.0); // oldScale est 1.0 car c'est la première mise à l'échelle

                document.getElementById('editorImageName').textContent = `- ${filename}`;
                this.updateZoomDisplay(); // Met à jour l'UI avec this.currentCanvasScale
                
                this.saveState(); // Sauvegarder l'état initial
                this.renderLayersUI();
                this.updatePropertiesFromActiveObject();
                
                resolve();
            }, { crossOrigin: 'anonymous' }); // Pour éviter les problèmes de tainted canvas si l'image vient d'un autre domaine
        });
    }
    
    /**
     * Gestion des événements de souris
     */
    onMouseDown(e) {
        // Le panning avec Ctrl/Meta est prioritaire
        if (e.e.ctrlKey || e.e.metaKey) {
            this.isPanning = true;
            this.lastPanPoint = { x: e.e.clientX, y: e.e.clientY };
            this.initialScroll = { left: this.canvasWrapper.scrollLeft, top: this.canvasWrapper.scrollTop };
            this.canvasWrapper.style.cursor = 'grabbing';
            return;
        }
        
        // Si l'outil est 'select', Fabric.js gère la sélection/déplacement.
        // Notre nouvelle logique dans setTool assure que c'est le seul cas où les objets sont sélectionnables.
        if (this.currentTool === 'select') {
            return;
        }

        // Pour tous les autres outils, on initie un dessin.
        // setTool a déjà désactivé la sélection, donc pas de risque de déplacer un objet.
        const pointer = this.canvas.getPointer(e.e);
        this.isDrawing = true;
        this.startX = pointer.x;
        this.startY = pointer.y;
        this.tempObject = null;

        this.suppressSaveStateForTempObject = true;

        if (this.currentTool === 'text') {
            this.addText(pointer.x, pointer.y);
            this.isDrawing = false; // Le texte est un événement ponctuel
            this.suppressSaveStateForTempObject = false;
        } else if (this.currentTool === 'annotation') {
            this.addAnnotation(pointer.x, pointer.y);
            this.isDrawing = false; // L'annotation est gérée en deux étapes
            this.suppressSaveStateForTempObject = false;
        }
    }
    
    onMouseMove(e) {
        // Nouvelle logique de panning via scroll du wrapper
        if (this.isPanning && this.lastPanPoint) {
            const currentMousePoint = { x: e.e.clientX, y: e.e.clientY };
            const deltaX = currentMousePoint.x - this.lastPanPoint.x;
            const deltaY = currentMousePoint.y - this.lastPanPoint.y;
            
            this.canvasWrapper.scrollLeft = this.initialScroll.left - deltaX;
            this.canvasWrapper.scrollTop = this.initialScroll.top - deltaY;
            return; // Ne pas laisser Fabric gérer autre chose
        }
        
        if (!this.isDrawing || this.currentTool === 'select' || this.currentTool === 'pen') return;
        
        const pointer = this.canvas.getPointer(e.e);
        
        if (this.tempObject) {
            this.canvas.remove(this.tempObject);
        }
        
        this.tempObject = this.createShape(this.startX, this.startY, pointer.x, pointer.y);
        if (this.tempObject) {
            this.canvas.add(this.tempObject);
            this.canvas.renderAll();
        }
    }
    
    onMouseUp(e) {
        // Nouvelle logique de panning via scroll du wrapper
        if (this.isPanning) {
            this.isPanning = false;
            this.lastPanPoint = null;
            this.initialScroll = null;
            this.canvasWrapper.style.cursor = 'auto'; // ou 'default'
            this.canvas.defaultCursor = this.tools[this.currentTool]?.cursor || 'default';
            this.canvas.hoverCursor = this.tools[this.currentTool]?.cursor || 'default';
            return; // Ne pas laisser Fabric gérer autre chose si on pannait
        }
        
        // Gérer le second clic pour finaliser l'annotation
        if (this.isCreatingAnnotation && this.tempAnnotationBox) {
            const pointer = this.canvas.getPointer(e.e);
            this.finalizeAnnotation(pointer.x, pointer.y);
            return;
        }
        
        if (!this.isDrawing) return;
        this.isDrawing = false; // Important de le mettre à false ici
        
        switch (this.currentTool) {
            case 'rectangle':
            case 'circle':
            case 'arrow':
            case 'line':
                this.suppressSaveStateForTempObject = false; // Réactiver saveState
                if (this.tempObject) {
                    this.tempObject.setCoords(); // Finaliser les coordonnées
                    this.saveState(); // Sauvegarder l'état final
                    this.setTool('select'); // Revenir à l'outil de sélection après avoir dessiné
                    // Sélectionner l'objet nouvellement créé pour une modification facile
                    setTimeout(() => {
                        this.canvas.setActiveObject(this.tempObject);
                        this.canvas.renderAll();
                    }, 0);
                    this.tempObject = null; // Nettoyer
                }
                break;
            case 'pen':
                // Rien à faire ici, géré par l'événement path:created de fabric
                break;
            // case 'text': // Géré par object:added après addText
            //     break;
        }
    }
    
    /**
     * Crée une forme selon l'outil actuel
     */
    createShape(x1, y1, x2, y2) {
        const options = {
            stroke: this.currentColor,
            strokeWidth: this.currentStrokeWidth,
            fill: 'transparent',
            opacity: this.currentOpacity
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
            opacity: this.currentOpacity,
            editable: true,
            selectable: true,
            hasControls: true,
            hasBorders: true
        });
        
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        
        // Appel direct à editTextObject. Le délai sera géré à l'intérieur de cette fonction.
            this.editTextObject(text);
    }
    
    /**
     * Ajoute une annotation avec flèche
     */
    addAnnotation(x, y) {
        if (typeof logInfo === 'function') {
            logInfo('💬 Création d\'une annotation à:', x, y);
        }
        
        this.isCreatingAnnotation = true;
        this.tempAnnotationBox = null;
        
        // Créer d'abord la boîte d'annotation
        const bgRect = new fabric.Rect({
            left: x,
            top: y,
            width: 200,
            height: 60,
            fill: 'white',
            stroke: this.currentColor,
            strokeWidth: 2,
            rx: 5,
            ry: 5,
            originX: 'center',
            originY: 'center'
        });
        
        const text = new fabric.IText('Annotation...', {
            left: x,
            top: y,
            fontFamily: 'Arial',
            fontSize: 14,
            fill: 'black',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            editable: false
        });
        
        // Créer un groupe temporaire pour la boîte
        const annotationBox = new fabric.Group([bgRect, text], {
            left: x,
            top: y,
            originX: 'center',
            originY: 'center',
            hasControls: false,
            hasBorders: false,
            selectable: false,
            evented: false
        });
        
        this.tempAnnotationBox = annotationBox;
        this.canvas.add(annotationBox);
        
        // Afficher un message d'instruction
        this.showToast('Cliquez pour placer la pointe de la flèche', 'info');
        
        // Changer le curseur
        this.canvas.defaultCursor = 'crosshair';
    }
    
    /**
     * Finalise l'annotation avec la flèche
     */
    finalizeAnnotation(arrowX, arrowY) {
        if (!this.tempAnnotationBox) return;
        
        const box = this.tempAnnotationBox;
        const boxBounds = box.getBoundingRect();
        
        // Calculer le point de départ de la flèche (bord de la boîte le plus proche)
        let startX, startY;
        
        // Déterminer de quel côté la flèche doit partir
        const dx = arrowX - box.left;
        const dy = arrowY - box.top;
        const angle = Math.atan2(dy, dx);
        
        // Calculer le point sur le bord de la boîte
        const halfWidth = boxBounds.width / 2;
        const halfHeight = boxBounds.height / 2;
        
        if (Math.abs(Math.cos(angle)) * halfHeight > Math.abs(Math.sin(angle)) * halfWidth) {
            // Sortie par les côtés gauche/droite
            if (dx > 0) {
                startX = box.left + halfWidth;
                startY = box.top + (halfWidth * Math.tan(angle));
            } else {
                startX = box.left - halfWidth;
                startY = box.top - (halfWidth * Math.tan(angle));
            }
        } else {
            // Sortie par le haut/bas
            if (dy > 0) {
                startY = box.top + halfHeight;
                startX = box.left + (halfHeight / Math.tan(angle));
            } else {
                startY = box.top - halfHeight;
                startX = box.left - (halfHeight / Math.tan(angle));
            }
        }
        
        // Créer la flèche
        const arrow = this.createArrow(startX, startY, arrowX, arrowY, {
            stroke: this.currentColor,
            strokeWidth: 2,
            fill: this.currentColor
        });
        
        // Dégrouper la boîte temporaire
        const items = box._objects;
        box._restoreObjectsState();
        this.canvas.remove(box);
        
        // Créer le groupe final
        const allItems = [...items, arrow];
        const annotationGroup = new fabric.Group(allItems, {
            left: (box.left + arrowX) / 2,
            top: (box.top + arrowY) / 2,
            originX: 'center',
            originY: 'center',
            isAnnotation: true
        });
        
        this.canvas.add(annotationGroup);
        this.canvas.setActiveObject(annotationGroup);
        
        // Permettre l'édition du texte en double-cliquant
        annotationGroup.on('mousedown', (e) => {
            if (e.e.detail === 2) { // Double-clic
                const items = annotationGroup._objects;
                const textObj = items.find(obj => obj.type === 'i-text');
                
                if (textObj) {
                    this.canvas.discardActiveObject();
                    annotationGroup._restoreObjectsState();
                    this.canvas.remove(annotationGroup);
                    
                    items.forEach(obj => this.canvas.add(obj));
                    this.canvas.setActiveObject(textObj);
                    textObj.enterEditing();
                    textObj.selectAll();
                    
                    // Regrouper après l'édition
                    textObj.on('editing:exited', () => {
                        this.canvas.discardActiveObject();
                        items.forEach(obj => this.canvas.remove(obj));
                        
                        const newGroup = new fabric.Group(items, {
                            left: annotationGroup.left,
                            top: annotationGroup.top,
                            angle: annotationGroup.angle,
                            originX: 'center',
                            originY: 'center',
                            isAnnotation: true
                        });
                        
                        this.canvas.add(newGroup);
                        this.canvas.setActiveObject(newGroup);
                        
                        // Réappliquer l'événement
                        newGroup.on('mousedown', annotationGroup.__eventListeners['mousedown'][0]);
                    });
                }
            }
        });
        
        // Nettoyer
        this.isCreatingAnnotation = false;
        this.tempAnnotationBox = null;
        this.canvas.defaultCursor = 'default';
        
        // Revenir à l'outil de sélection
        this.setTool('select');
        
        // Sauvegarder l'état
        this.saveState();
    }
    
    /**
     * Édite un objet texte (fonction centralisée)
     */
    editTextObject(textObj) {
        if (typeof logInfo === 'function') {
            logInfo('✏️ Début édition texte (via liste de calques), type:', textObj.type, 'ID:', textObj.id);
        }
        
        const layersListElement = document.getElementById('layersList');
        const layerItem = layersListElement.querySelector(`[data-layer-id="${textObj.id}"]`);

        if (!layerItem) {
            if (typeof logError === 'function') logError('❌ Élément de calque non trouvé pour édition:', textObj.id);
            return;
                }
                
        const textDisplay = layerItem.querySelector('.layer-text-content');
        const currentText = textObj.text;

        if (!textDisplay) {
             if (typeof logError === 'function') logError('❌ Affichage de texte du calque non trouvé pour:', textObj.id);
            return;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'layer-edit-input'; // Pour stylisation future
        input.style.width = 'calc(100% - 50px)'; // Ajuster pour laisser de la place aux boutons

        // Remplacer l'affichage du texte par l'input
        textDisplay.innerHTML = ''; // Vider le contenu (icône + texte)
        textDisplay.appendChild(input);
        input.focus();
        input.select();

        const saveChanges = () => {
            const newText = input.value;
            textObj.set('text', newText);
            this.canvas.renderAll();
            this.saveState(); // Sauvegarder l'état après modification du texte
            
            // Restaurer l'affichage normal et mettre à jour l'UI des calques
            this.renderLayersUI(); 
            // Potentiellement, au lieu de tout re-rendre, on pourrait juste mettre à jour cet item spécifique.
            // Pour l'instant, renderLayersUI() est plus simple et gère la surbrillance.
        };

        input.addEventListener('blur', () => {
            saveChanges();
            // L'input sera retiré par renderLayersUI()
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveChanges();
                 // L'input sera retiré par renderLayersUI()
            } else if (e.key === 'Escape') {
                // Annuler les changements et restaurer l'affichage normal
                this.renderLayersUI();
            }
        });
    }
    
    /**
     * Démarre le dessin libre
     */
    startFreeDrawing() {
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush.width = this.currentStrokeWidth;
        this.canvas.freeDrawingBrush.color = this.currentColor;
        this.canvas.renderAll(); // S'assurer que le curseur change immédiatement
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
        if (this.currentTool === tool) return; // Ne rien faire si l'outil est déjà actif

        this.currentTool = tool;
        console.log(`Outil changé pour : ${tool}`);

        // Gérer spécifiquement le mode dessin de Fabric pour l'outil stylo
        if (tool === 'pen') {
            this.startFreeDrawing();
        } else {
            this.stopFreeDrawing();
        }

        // Gérer l'état de sélection et l'interactivité des objets
        if (tool === 'select') {
            this.canvas.selection = true;
            this.canvas.defaultCursor = this.tools.select.cursor;
            this.canvas.getObjects().forEach(obj => {
                // Rendre tous les objets sélectionnables, sauf l'image de fond
                obj.set({ selectable: !obj.isOriginalImage, evented: true });
            });
        } else {
            // Pour tous les autres outils (dessin, texte, etc.)
            this.canvas.selection = false;
            this.canvas.discardActiveObject(); // TRES IMPORTANT: désélectionner tout objet
            this.canvas.defaultCursor = this.tools[tool]?.cursor || 'crosshair';
            
            // Rendre les objets non-interactifs pour ne pas les déplacer en dessinant
            this.canvas.getObjects().forEach(obj => {
                obj.set({ selectable: false, evented: false });
            });
        }
        
        // Mettre à jour l'UI des boutons de la barre d'outils
        document.querySelectorAll('.toolbar-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        this.canvas.renderAll();
        this.updatePropertiesFromActiveObject(); // Mettre à jour le panneau des propriétés
    }
    
    /**
     * Change la couleur
     */
    setColor(color) {
        this.currentColor = color;
        
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const colorBtn = document.querySelector(`[data-color="${color}"]`) || document.getElementById('customColorPicker');
        if (colorBtn && colorBtn.type === 'color') { // Pour le custom picker
             // Pas besoin de .active pour l'input color, sa valeur est son indicateur
        } else if (colorBtn) {
            colorBtn.classList.add('active');
        }
        if (document.getElementById('customColorPicker').value !== color && !color.startsWith('#')) {
             // Si la couleur n'est pas une couleur rapide, le picker la prend
            document.getElementById('customColorPicker').value = color;
        }
        

        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            const props = {};
            if (activeObject.type === 'i-text' || activeObject.type === 'text') {
                props.fill = color;
            } else { // Pour les formes, on modifie le trait
                props.stroke = color;
                
                // Si c'est un groupe (comme une flèche), appliquer à tous les objets enfants
                if (activeObject.type === 'group' && activeObject._objects) {
                    activeObject._objects.forEach(obj => {
                        if (obj.stroke !== undefined) {
                            obj.set('stroke', color);
                        }
                    });
                }
            }
            activeObject.set(props);
            this.canvas.requestRenderAll();
            this.saveState(); // Sauvegarder après modification
        }
    }
    
    /**
     * Sauvegarde l'état pour l'historique
     */
    saveState() {
        if (this.historyStep < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyStep + 1);
        }
        
        // Sauvegarder l'état avec les dimensions du canvas
        const canvasState = this.canvas.toJSON();
        canvasState.baseCanvasWidth = this.baseCanvasWidth;
        canvasState.baseCanvasHeight = this.baseCanvasHeight;
        
        this.history.push(JSON.stringify(canvasState));
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
        // Sauvegarder les dimensions actuelles si elles sont dans l'état
        const stateObj = JSON.parse(state);
        
        this.canvas.loadFromJSON(state, () => {
            // Restaurer les dimensions du canvas si elles ont changé
            if (stateObj.baseCanvasWidth && stateObj.baseCanvasHeight) {
                this.baseCanvasWidth = stateObj.baseCanvasWidth;
                this.baseCanvasHeight = stateObj.baseCanvasHeight;
                
                // Réappliquer les dimensions
                const oldScale = this.currentCanvasScale;
                this.applyCanvasScaleAndObjects(oldScale);
            }
            
            // Retrouver l'image originale
            const objects = this.canvas.getObjects();
            for (let obj of objects) {
                if (obj.isOriginalImage) {
                    this.originalImage = obj;
                    break;
                }
            }
            
            this.canvas.renderAll();
            this.updateHistoryButtons();
            this.renderLayersUI(); // Mettre à jour les calques après chargement d'un état
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
        // Garder une référence à l'image originale
        const originalImageRef = this.originalImage;
        
        this.canvas.clear();
        
        // Remettre l'image originale
        if (originalImageRef) {
            this.canvas.add(originalImageRef);
            this.canvas.sendToBack(originalImageRef);
        }
        
        this.saveState();
        this.renderLayersUI(); // Mettre à jour après effacement
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
        if (e.shiftKey) { // Zoom seulement si Shift est pressé
            e.preventDefault();
            e.stopPropagation();
            
            const oldScale = this.currentCanvasScale;
            const delta = e.deltaY;
            
            // Ajuster la sensibilité du zoom à la molette
            const zoomFactor = delta > 0 ? 0.9 : 1.1; // Zoom out si delta > 0, zoom in sinon
            let newScale = oldScale * zoomFactor;
            
            // Limiter l'échelle
            this.currentCanvasScale = Math.min(Math.max(newScale, this.MIN_CANVAS_SCALE), this.MAX_CANVAS_SCALE);

            if (typeof logInfo === 'function') {
                logInfo(`[ZOOM WHEEL] Old: ${oldScale.toFixed(2)}, Delta: ${delta}, New Attempt: ${newScale.toFixed(2)}, Final: ${this.currentCanvasScale.toFixed(2)}`);
            }

            if (oldScale !== this.currentCanvasScale) {
                this.applyCanvasScaleAndObjects(oldScale);
            }
            // updateZoomDisplay est appelé à la fin de applyCanvasScaleAndObjects
        }
    }
    
    updateZoomDisplay() {
        const zoomLevelElement = document.getElementById('zoomLevel');
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${Math.round(this.currentCanvasScale * 100)}%`;
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
        
        // Mettre à jour les boutons de gestion des calques
        this.updateLayerButtonsVisibility();
    }
    
    /**
     * Met à jour l'état des boutons de gestion des calques
     */
    updateLayerButtonsVisibility() {
        const activeObject = this.canvas.getActiveObject();
        const isEnabled = activeObject && !activeObject.isOriginalImage;
        
        ['bringToFrontBtn', 'sendToBackBtn', 'bringForwardBtn', 'sendBackwardBtn'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = !isEnabled;
            }
        });
    }
    
    /**
     * Configure les événements clavier pour le canvas
     */
    setupCanvasKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            if (!this.modal || !document.getElementById('imageEditorModal').classList.contains('show')) {
                return;
            }
            
            const activeElement = document.activeElement;
            const isEditingInLayerInput = activeElement && 
                                          (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
                                          activeElement.closest('.layers-list'); 
            
            if (typeof logInfo === 'function') {
                logInfo('⌨️ Touche:', e.key, 'Édition dans input calque:', isEditingInLayerInput);
            }
            
            if (isEditingInLayerInput) {
                return;
            }
            
            switch(e.key) {
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    this.deleteSelectedObject();
                    break;
                case 'Escape':
                    this.canvas.discardActiveObject();
                    this.canvas.renderAll();
                    this.renderLayersUI(); 
                    break;
                // La gestion du curseur pour Ctrl/Meta pendant le keydown est supprimée,
                // car elle est maintenant gérée directement dans onMouseDown/onMouseUp pour le panning du wrapper.
                // case 'Control':
                // case 'Meta': 
                //     break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!this.modal || !document.getElementById('imageEditorModal').classList.contains('show')) {
                return;
            }
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && activeElement.closest('.layers-list')) {
                return;
            }

            // Le relâchement de Ctrl/Meta ne doit plus restaurer le curseur du canvas Fabric
            // car le panoramique change le curseur du wrapper et le restaure à la fin du pan.
            // Si d'autres outils modifient le curseur du canvas Fabric, ils doivent le restaurer eux-mêmes.
            // if (e.key === 'Control' || e.key === 'Meta') {
            //     this.canvas.defaultCursor = this.tools[this.currentTool]?.cursor || 'default';
            //     this.canvas.hoverCursor = this.tools[this.currentTool]?.cursor || 'default';
            // }
        });
    }
    
    /**
     * Zoom in
     */
    zoomIn() {
        const oldScale = this.currentCanvasScale;
        let newScale = this.currentCanvasScale * 1.2;
        this.currentCanvasScale = Math.min(newScale, this.MAX_CANVAS_SCALE);
        
        if (oldScale !== this.currentCanvasScale) {
            this.applyCanvasScaleAndObjects(oldScale);
        }
    }
    
    /**
     * Zoom out
     */
    zoomOut() {
        const oldScale = this.currentCanvasScale;
        let newScale = this.currentCanvasScale / 1.2;
        this.currentCanvasScale = Math.max(newScale, this.MIN_CANVAS_SCALE);

        if (oldScale !== this.currentCanvasScale) {
            this.applyCanvasScaleAndObjects(oldScale);
        }
    }
    
    /**
     * Ajuster à l'écran
     */
    fitToScreen() {
        if (!this.baseCanvasWidth || !this.baseCanvasHeight) return; // Image pas encore chargée

        const PADDING = 10;
        const availableWidth = this.canvasWrapper.clientWidth - PADDING;
        const availableHeight = this.canvasWrapper.clientHeight - PADDING;
            
        const scaleToFitWidth = availableWidth / this.baseCanvasWidth;
        const scaleToFitHeight = availableHeight / this.baseCanvasHeight;
        
        // On prend la plus petite échelle pour que tout rentre, sans dépasser 100% de la taille native de l'image initialement
        // Mais si l'utilisateur veut "fitToScreen" après avoir zoomé, on peut autoriser un scale > 1 si l'image est petite
        const targetScale = Math.min(scaleToFitWidth, scaleToFitHeight);
            
        const oldScale = this.currentCanvasScale;
        this.currentCanvasScale = Math.min(Math.max(targetScale, this.MIN_CANVAS_SCALE), this.MAX_CANVAS_SCALE);
        
        if (typeof logInfo === 'function') {
            logInfo(`[FIT TO SCREEN] Base: ${this.baseCanvasWidth}x${this.baseCanvasHeight}, Available: ${availableWidth}x${availableHeight}, TargetFitScale: ${targetScale.toFixed(2)}, Final CurrentScale: ${this.currentCanvasScale.toFixed(2)}`);
        }

        if (oldScale !== this.currentCanvasScale) {
            this.applyCanvasScaleAndObjects(oldScale);
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
        if (!this.canvas) {
            this.showError('Le canvas n\'est pas initialisé.');
            return;
        }

        try {
            const originalFilename = this.currentImageData.filename;
            let outputFormat = 'png';
            let quality = undefined; 

            const lowerCaseFilename = originalFilename.toLowerCase();
            if (lowerCaseFilename.endsWith('.jpg') || lowerCaseFilename.endsWith('.jpeg')) {
                outputFormat = 'jpeg';
                quality = 0.9;
            }

            let filenameToSave;
            let newExtension = `.${outputFormat}`;

            if (replaceOriginal) {
                const base = originalFilename.substring(0, originalFilename.lastIndexOf('.'));
                filenameToSave = base + newExtension;
            } else {
                const base = originalFilename.substring(0, originalFilename.lastIndexOf('.'));
                const timestamp = new Date().getTime();
                filenameToSave = `${base}_annotated_${timestamp}${newExtension}`;
            }

            // Calculer le multiplicateur pour exporter à la taille de base de l'image
            const exportMultiplier = this.baseCanvasWidth > 0 ? (this.baseCanvasWidth / (this.baseCanvasWidth * this.currentCanvasScale)) : 1;
            if (typeof logInfo === 'function') {
                logInfo(`[SAVE IMG] Current scale: ${this.currentCanvasScale}, BaseWidth: ${this.baseCanvasWidth}, CanvasElementWidth: ${this.canvas.getElement().width}, Export multiplier: ${exportMultiplier}`);
            }
            
            const dataURL = this.canvas.toDataURL({
                format: outputFormat,
                quality: quality,
                multiplier: exportMultiplier
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
                        
                        // NOUVEAU : Hériter du nom IA dans window.appState
                        this.inheritAINameInAppState(originalFilename, newFilename);
                        
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
                // Assurer que le double-clic sur l'image utilise le nouveau nom de fichier
                imgElement.ondblclick = (event) => {
                    if (typeof showImagePreview === 'function') {
                        showImagePreview(newFilename, event);
                    } else {
                        console.warn('showImagePreview function not found for dblclick');
                    }
                };
                console.debug(`[DIAGNOSTIC] Image src et dblclick mis à jour: ${newSrc}`);
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
     * Fait hériter du nom IA de l'image source vers l'image éditée
     */
    inheritAINameInAppState(originalFilename, newFilename) {
        try {
            if (typeof window.appState !== 'undefined' && window.appState.sections) {
                // Trouver l'image originale dans appState pour récupérer ses métadonnées IA
                for (let section of window.appState.sections) {
                    const originalImage = section.images.find(img => img.filename === originalFilename);
                    if (originalImage && originalImage.isAIRenamed && originalImage.aiSuggestedName) {
                        if (typeof logInfo === 'function') {
                            logInfo(`🧬 Héritage nom IA: "${originalImage.aiSuggestedName}" de ${originalFilename} vers ${newFilename}`);
                        }
                        
                        // Trouver la nouvelle image dans la même section pour appliquer l'héritage
                        const newImage = section.images.find(img => img.filename === newFilename);
                        if (newImage) {
                            newImage.isAIRenamed = true;
                            newImage.aiSuggestedName = originalImage.aiSuggestedName;
                            newImage.aiTags = originalImage.aiTags ? [...originalImage.aiTags] : [];
                            
                            if (typeof logInfo === 'function') {
                                logInfo(`✅ Nom IA hérité avec succès: ${newImage.aiSuggestedName}`);
                            }
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            if (typeof logError === 'function') {
                logError('❌ Erreur lors de l\'héritage du nom IA:', error);
            }
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
            // Assurer que le double-clic sur l'image utilise le nouveau nom de fichier
            imgElement.ondblclick = (event) => {
                if (typeof showImagePreview === 'function') {
                    showImagePreview(newFilename, event);
                } else {
                    console.warn('showImagePreview function not found for dblclick');
                }
            };
            console.log(`[ImageEditor] updateImageInDOM: src de l'image et dblclick mis à jour vers ${newImageSrc}`);

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
        document.getElementById('strokeWidth').value = this.currentStrokeWidth;
        document.getElementById('strokeWidthValue').textContent = `${this.currentStrokeWidth}px`;
        
        document.getElementById('opacity').value = Math.round(this.currentOpacity * 100);
        document.getElementById('opacityValue').textContent = `${Math.round(this.currentOpacity * 100)}%`;
        
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
            const colorButton = e.target.closest('.color-btn[data-color]');
            if (colorButton) {
                this.setColor(colorButton.dataset.color);
            }
        });
        
        const customColorPicker = document.getElementById('customColorPicker');
        if (customColorPicker) {
            customColorPicker.addEventListener('input', (e) => { // 'input' pour un retour en direct
                this.setColor(e.target.value);
            });
        }
        
        // Propriétés
        const strokeWidth = document.getElementById('strokeWidth');
        if (strokeWidth) {
            strokeWidth.addEventListener('input', (e) => {
                // S'assurer que l'épaisseur ne devient jamais 0
                let val = parseInt(e.target.value);
                if (isNaN(val) || val < 1) val = 1;
                
                this.currentStrokeWidth = val;
                e.target.value = val; // Mettre à jour l'input si la valeur a été corrigée
                document.getElementById('strokeWidthValue').textContent = `${val}px`;
                const activeObject = this.canvas.getActiveObject();

                if (activeObject && (activeObject.type !== 'i-text' && activeObject.type !== 'text')) {
                    // Log initial de l'état de l'objet
                    if (typeof logInfo === 'function') {
                        logInfo('[STROKE UPDATE - START]', {
                            id: activeObject.id,
                            type: activeObject.type,
                            currentStroke: activeObject.stroke,
                            currentStrokeWidth: activeObject.strokeWidth,
                            newStrokeWidthValue: val,
                            currentFill: activeObject.fill,
                            editorCurrentColor: this.currentColor
                        });
                    }

                    let strokeToApply = activeObject.stroke;
                    // Si le trait actuel de l'objet est manquant ou transparent,
                    // et que le remplissage est aussi transparent (ou manquant), 
                    // alors nous utilisons la couleur active de l'éditeur pour le trait.
                    // Cela garantit que le trait sera visible lorsque son épaisseur est modifiée.
                    if (!strokeToApply || strokeToApply === 'transparent') {
                        if (!activeObject.fill || activeObject.fill === 'transparent') {
                            strokeToApply = this.currentColor;
                            if (typeof logInfo === 'function') {
                                logInfo('[STROKE UPDATE] Stroke was undefined/transparent with transparent fill. Setting stroke to editor currentColor:', strokeToApply);
                            }
                        }
                    }

                    // Si c'est un groupe (comme une flèche), appliquer à tous les objets enfants
                    if (activeObject.type === 'group' && activeObject._objects) {
                        activeObject._objects.forEach(obj => {
                            if (obj.stroke) {
                                obj.set({
                                    strokeWidth: val,
                                    stroke: obj.stroke === 'transparent' ? strokeToApply : obj.stroke,
                                    strokeUniform: true
                                });
                            }
                        });
                    }
                    
                    activeObject.set({
                        strokeWidth: val,
                        stroke: strokeToApply, // Appliquer la couleur de trait déterminée
                        strokeUniform: true 
                    });

                    if (typeof logInfo === 'function') {
                        logInfo('[STROKE UPDATE - END]', {
                            id: activeObject.id,
                            type: activeObject.type,
                            updatedStroke: activeObject.stroke,
                            updatedStrokeWidth: activeObject.strokeWidth,
                            strokeUniformSet: activeObject.strokeUniform
                        });
                    }

                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }
        
        const opacity = document.getElementById('opacity');
        if (opacity) {
            opacity.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) / 100;
                this.currentOpacity = val;
                document.getElementById('opacityValue').textContent = `${Math.round(val * 100)}%`;
                const activeObject = this.canvas.getActiveObject();
                if (activeObject) {
                    activeObject.set('opacity', val);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }

        const fontFamily = document.getElementById('fontFamily');
        if (fontFamily) {
            fontFamily.addEventListener('change', (e) => {
                const val = e.target.value;
                this.currentFontFamily = val;
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                    activeObject.set('fontFamily', val);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }

        const fontSize = document.getElementById('fontSize');
        if (fontSize) {
            fontSize.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.currentFontSize = val;
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                    activeObject.set('fontSize', val);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }

        const boldBtn = document.getElementById('boldBtn');
        if (boldBtn) {
            boldBtn.addEventListener('click', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                    const isBold = activeObject.fontWeight === 'bold';
                    activeObject.set('fontWeight', isBold ? 'normal' : 'bold');
                    boldBtn.classList.toggle('active', !isBold);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }

        const italicBtn = document.getElementById('italicBtn');
        if (italicBtn) {
            italicBtn.addEventListener('click', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                    const isItalic = activeObject.fontStyle === 'italic';
                    activeObject.set('fontStyle', isItalic ? 'normal' : 'italic');
                    italicBtn.classList.toggle('active', !isItalic);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }

        const underlineBtn = document.getElementById('underlineBtn');
        if (underlineBtn) {
            underlineBtn.addEventListener('click', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                    const isUnderline = activeObject.underline === true;
                    activeObject.set('underline', !isUnderline);
                    underlineBtn.classList.toggle('active', !isUnderline);
                    this.canvas.requestRenderAll();
                    this.saveState();
                }
            });
        }
        
        // Event listeners pour les images fusionnées
        const mergeX = document.getElementById('mergeX');
        const mergeY = document.getElementById('mergeY');
        const mergeWidth = document.getElementById('mergeWidth');
        const mergeHeight = document.getElementById('mergeHeight');
        const mergeRotation = document.getElementById('mergeRotation');
        const lockRatioBtn = document.getElementById('lockRatio');
        
        let isRatioLocked = false;
        let aspectRatio = 1;
        
        if (lockRatioBtn) {
            lockRatioBtn.addEventListener('click', () => {
                isRatioLocked = !isRatioLocked;
                lockRatioBtn.classList.toggle('active', isRatioLocked);
                
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage && isRatioLocked) {
                    aspectRatio = (activeObject.width * activeObject.scaleX) / (activeObject.height * activeObject.scaleY);
                }
            });
        }
        
        if (mergeX) {
            mergeX.addEventListener('input', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                    activeObject.set('left', parseInt(e.target.value) || 0);
                    this.canvas.requestRenderAll();
                }
            });
            mergeX.addEventListener('change', () => this.saveState());
        }
        
        if (mergeY) {
            mergeY.addEventListener('input', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                    activeObject.set('top', parseInt(e.target.value) || 0);
                    this.canvas.requestRenderAll();
                }
            });
            mergeY.addEventListener('change', () => this.saveState());
        }
        
        if (mergeWidth) {
            mergeWidth.addEventListener('input', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                    const newWidth = parseInt(e.target.value) || 1;
                    const newScaleX = newWidth / activeObject.width;
                    activeObject.set('scaleX', newScaleX);
                    
                    if (isRatioLocked) {
                        const newHeight = newWidth / aspectRatio;
                        const newScaleY = newHeight / activeObject.height;
                        activeObject.set('scaleY', newScaleY);
                        mergeHeight.value = Math.round(newHeight);
                    }
                    
                    this.canvas.requestRenderAll();
                }
            });
            mergeWidth.addEventListener('change', () => this.saveState());
        }
        
        if (mergeHeight) {
            mergeHeight.addEventListener('input', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                    const newHeight = parseInt(e.target.value) || 1;
                    const newScaleY = newHeight / activeObject.height;
                    activeObject.set('scaleY', newScaleY);
                    
                    if (isRatioLocked) {
                        const newWidth = newHeight * aspectRatio;
                        const newScaleX = newWidth / activeObject.width;
                        activeObject.set('scaleX', newScaleX);
                        mergeWidth.value = Math.round(newWidth);
                    }
                    
                    this.canvas.requestRenderAll();
                }
            });
            mergeHeight.addEventListener('change', () => this.saveState());
        }
        
        if (mergeRotation) {
            mergeRotation.addEventListener('input', (e) => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                    const rotation = parseInt(e.target.value) || 0;
                    activeObject.set('angle', rotation);
                    document.getElementById('rotationValue').textContent = `${rotation}°`;
                    this.canvas.requestRenderAll();
                }
            });
            mergeRotation.addEventListener('change', () => this.saveState());
        }
        
        // Event listeners pour les boutons d'actions spéciales
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.openMergeImageSelector();
            });
        }
        
        // Bouton de redimensionnement du canvas
        const resizeCanvasBtn = document.getElementById('resizeCanvasBtn');
        if (resizeCanvasBtn) {
            resizeCanvasBtn.addEventListener('click', () => {
                this.toggleCanvasResizeMode();
            });
        }
        
        // Boutons de gestion des calques
        const bringToFrontBtn = document.getElementById('bringToFrontBtn');
        if (bringToFrontBtn) {
            bringToFrontBtn.addEventListener('click', () => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && !activeObject.isOriginalImage) {
                    this.canvas.bringToFront(activeObject);
                    this.canvas.renderAll();
                    this.saveState();
                    this.renderLayersUI();
                }
            });
        }
        
        const sendToBackBtn = document.getElementById('sendToBackBtn');
        if (sendToBackBtn) {
            sendToBackBtn.addEventListener('click', () => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && !activeObject.isOriginalImage) {
                    this.canvas.sendToBack(activeObject);
                    // S'assurer que l'image originale reste vraiment en arrière-plan
                    if (this.originalImage) {
                        this.canvas.sendToBack(this.originalImage);
                    }
                    this.canvas.renderAll();
                    this.saveState();
                    this.renderLayersUI();
                }
            });
        }
        
        const bringForwardBtn = document.getElementById('bringForwardBtn');
        if (bringForwardBtn) {
            bringForwardBtn.addEventListener('click', () => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && !activeObject.isOriginalImage) {
                    this.canvas.bringForward(activeObject);
                    this.canvas.renderAll();
                    this.saveState();
                    this.renderLayersUI();
                }
            });
        }
        
        const sendBackwardBtn = document.getElementById('sendBackwardBtn');
        if (sendBackwardBtn) {
            sendBackwardBtn.addEventListener('click', () => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject && !activeObject.isOriginalImage) {
                    this.canvas.sendBackwards(activeObject);
                    this.canvas.renderAll();
                    this.saveState();
                    this.renderLayersUI();
                }
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

    // Nouvelle fonction pour afficher les calques
    renderLayersUI() {
        const layersListElement = document.getElementById('layersList');
        if (!layersListElement) return;

        layersListElement.innerHTML = ''; 
        // Filtrer les objets pour exclure les poignées de redimensionnement et les bordures
        const objects = this.canvas.getObjects()
            .filter(obj => !obj.isResizeHandle && obj !== this.canvasBorder)
            .slice().reverse(); 

        const activeObject = this.canvas.getActiveObject();
        const activeObjects = this.canvas.getActiveObjects ? this.canvas.getActiveObjects() : (activeObject ? [activeObject] : []);


        objects.forEach(obj => {
            if (!obj.id) { 
                obj.id = `layer_${this.layerIdCounter++}`;
            }

            const listItem = document.createElement('div'); 
            listItem.className = 'layer-item';
            listItem.setAttribute('data-layer-id', obj.id);
            listItem.setAttribute('draggable', 'true');

            if (activeObjects.some(activeObj => activeObj.id === obj.id)) {
                listItem.classList.add('active');
            }

            let content = '';
            let objectTypeDisplay = '';
            let iconClass = 'fas fa-square'; 

            switch (obj.type) {
                case 'i-text':
                case 'text':
                    objectTypeDisplay = 'Texte';
                    iconClass = 'fas fa-font';
                    const textContent = obj.text.substring(0, 20) + (obj.text.length > 20 ? '...' : '');
                    content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${textContent}</span>`;
                    break;
                case 'image':
                    // Distinguer les images fusionnées
                    if (obj.isMergedImage) {
                        objectTypeDisplay = 'Image fusionnée';
                        iconClass = 'fas fa-image';
                        const filename = obj.mergedImageFilename || 'Image';
                        content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${filename}</span>`;
                    } else {
                        // Ne pas afficher l'image de fond dans les calques
                        return;
                    }
                    break;
                case 'rect':
                    objectTypeDisplay = 'Rectangle';
                    iconClass = 'fas fa-square';
                    content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> Rectangle</span>`;
                    break;
                case 'circle':
                    objectTypeDisplay = 'Cercle';
                    iconClass = 'fas fa-circle';
                    content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> Cercle</span>`;
                    break;
                case 'line':
                    objectTypeDisplay = 'Ligne';
                    iconClass = 'fas fa-minus';
                    content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> Ligne</span>`;
                    break;
                case 'triangle': 
                     objectTypeDisplay = 'Triangle'; 
                     iconClass = 'fas fa-caret-up'; 
                     content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> Triangle</span>`;
                     break;
                case 'group': 
                    objectTypeDisplay = 'Groupe';
                    iconClass = 'fas fa-object-group';
                    if (obj.isAnnotation) {
                        objectTypeDisplay = 'Annotation';
                        iconClass = 'fas fa-comment-dots';
                        // Extraire le texte de l'annotation
                        const textObj = obj._objects.find(o => o.type === 'i-text' || o.type === 'text');
                        const annotationText = textObj ? textObj.text.substring(0, 20) + (textObj.text.length > 20 ? '...' : '') : 'Annotation';
                        content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${annotationText}</span>`;
                    } else if (obj._objects && obj._objects.length === 3 && obj._objects[0].type === 'line' && obj._objects[1].type === 'line' && obj._objects[2].type === 'line') {
                        objectTypeDisplay = 'Flèche';
                        iconClass = 'fas fa-long-arrow-alt-right';
                        content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${objectTypeDisplay}</span>`;
                    } else {
                        content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${objectTypeDisplay}</span>`;
                    }
                    break;
                default:
                    objectTypeDisplay = obj.type ? obj.type.charAt(0).toUpperCase() + obj.type.slice(1) : 'Objet';
                    iconClass = 'fas fa-cube';
                    content = `<span class="layer-text-content"><i class="${iconClass} layer-icon"></i> ${objectTypeDisplay}</span>`;
            }
            
            listItem.innerHTML = content;

            if (obj.type === 'i-text' || obj.type === 'text') {
                const editButton = document.createElement('button');
                editButton.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                editButton.className = 'layer-edit-btn';
                editButton.title = 'Éditer le texte';
                editButton.onclick = (e) => {
                    e.stopPropagation(); 
                    this.editTextObject(obj);
                };
                listItem.appendChild(editButton);
            }

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteButton.className = 'layer-delete-btn';
            deleteButton.title = 'Supprimer ce calque';
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                this.canvas.setActiveObject(obj); 
                this.deleteSelectedObject(); 
            };
            listItem.appendChild(deleteButton);

            listItem.onclick = () => {
                this.canvas.discardActiveObject(); // D'abord désélectionner pour forcer la mise à jour si le même objet est recliqué
                this.canvas.setActiveObject(obj);
                    this.canvas.requestRenderAll();
                this.updatePropertiesFromActiveObject(); // Mettre à jour l'UI des propriétés
                this.renderLayersUI(); // Pour mettre à jour la surbrillance
            };

            layersListElement.appendChild(listItem);
        });
        
        // Ajouter les événements de drag & drop
        this.setupLayerDragAndDrop();
    }
    
    /**
     * Configure le drag & drop des calques
     */
    setupLayerDragAndDrop() {
        const layerItems = document.querySelectorAll('.layer-item');
        let draggedItem = null;
        let draggedObject = null;
        
        layerItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                const layerId = item.getAttribute('data-layer-id');
                draggedObject = this.canvas.getObjects().find(obj => obj.id === layerId);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                item.classList.add('drag-over');
            });
            
            item.addEventListener('dragleave', (e) => {
                item.classList.remove('drag-over');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                
                if (!draggedItem || !draggedObject || draggedItem === item) return;
                
                const dropLayerId = item.getAttribute('data-layer-id');
                const dropObject = this.canvas.getObjects().find(obj => obj.id === dropLayerId);
                
                if (!dropObject) return;
                
                // Obtenir les indices actuels
                const objects = this.canvas.getObjects();
                const draggedIndex = objects.indexOf(draggedObject);
                const dropIndex = objects.indexOf(dropObject);
                
                if (draggedIndex === -1 || dropIndex === -1) return;
                
                // Réorganiser les objets
                this.canvas.remove(draggedObject);
                
                // Si on déplace vers le bas, ajuster l'index
                const newIndex = draggedIndex < dropIndex ? dropIndex : dropIndex;
                
                // Insérer à la nouvelle position
                this.canvas.insertAt(draggedObject, newIndex);
                
                // Mettre à jour l'affichage
                this.canvas.renderAll();
                this.renderLayersUI();
                this.saveState();
            });
        });
    }

    // Nouvelle fonction pour mettre à jour l'UI des propriétés depuis l'objet actif
    updatePropertiesFromActiveObject() {
                const activeObject = this.canvas.getActiveObject();
        const textPropertiesPanel = document.querySelector('.text-properties');
        const strokeWidthGroup = document.getElementById('strokeWidth').closest('.property-group'); // Cible le groupe parent

        if (activeObject) {
            this.currentStrokeWidth = activeObject.strokeWidth === undefined ? this.currentStrokeWidth : (activeObject.strokeWidth < 1 ? 1 : activeObject.strokeWidth);
            this.currentOpacity = activeObject.opacity === undefined ? this.currentOpacity : activeObject.opacity;
            this.currentColor = activeObject.stroke || activeObject.fill || this.currentColor;

            document.getElementById('strokeWidth').value = this.currentStrokeWidth;
            document.getElementById('strokeWidthValue').textContent = `${this.currentStrokeWidth}px`;
            
            document.getElementById('opacity').value = Math.round(this.currentOpacity * 100);
            document.getElementById('opacityValue').textContent = `${Math.round(this.currentOpacity * 100)}%`;
            
            const customColorPicker = document.getElementById('customColorPicker');
            if (customColorPicker) customColorPicker.value = this.currentColor;
            document.querySelectorAll('.color-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === this.currentColor);
            });

            // Afficher/masquer les propriétés spécifiques selon le type d'objet
            const textProperties = document.querySelector('.text-properties');
            const mergeProperties = document.querySelector('.merge-properties');
            
            if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
                // Propriétés de texte
                textProperties.style.display = 'block';
                mergeProperties.style.display = 'none';
                
                if (strokeWidthGroup) strokeWidthGroup.style.display = 'none'; // Masquer l'épaisseur pour le texte
                
                this.currentFontFamily = activeObject.fontFamily || this.currentFontFamily;
                this.currentFontSize = activeObject.fontSize || this.currentFontSize;
                
                document.getElementById('fontFamily').value = this.currentFontFamily;
                document.getElementById('fontSize').value = this.currentFontSize;
                
                document.getElementById('boldBtn').classList.toggle('active', activeObject.fontWeight === 'bold');
                document.getElementById('italicBtn').classList.toggle('active', activeObject.fontStyle === 'italic');
                document.getElementById('underlineBtn').classList.toggle('active', activeObject.underline === true);
                
            } else if (activeObject && activeObject.type === 'image' && activeObject.isMergedImage) {
                // Propriétés des images fusionnées
                textProperties.style.display = 'none';
                mergeProperties.style.display = 'block';
                
                // Position
                document.getElementById('mergeX').value = Math.round(activeObject.left);
                document.getElementById('mergeY').value = Math.round(activeObject.top);
                
                // Dimensions
                document.getElementById('mergeWidth').value = Math.round(activeObject.width * activeObject.scaleX);
                document.getElementById('mergeHeight').value = Math.round(activeObject.height * activeObject.scaleY);
                
                // Rotation
                const rotation = activeObject.angle || 0;
                document.getElementById('mergeRotation').value = rotation;
                document.getElementById('rotationValue').textContent = `${Math.round(rotation)}°`;
            } else {
                // Masquer toutes les propriétés spécifiques
                textProperties.style.display = 'none';
                mergeProperties.style.display = 'none';
                
                // Pour les formes et autres objets non-texte
                if (strokeWidthGroup) strokeWidthGroup.style.display = 'block'; // Afficher l'épaisseur pour les formes
            }
        } else {
            textPropertiesPanel.style.display = 'none'; 
            if (strokeWidthGroup) strokeWidthGroup.style.display = 'block'; // Afficher par défaut si rien n'est sélectionné

            document.getElementById('strokeWidth').value = this.currentStrokeWidth;
            document.getElementById('strokeWidthValue').textContent = `${this.currentStrokeWidth}px`;
            document.getElementById('opacity').value = Math.round(this.currentOpacity * 100);
            document.getElementById('opacityValue').textContent = `${Math.round(this.currentOpacity * 100)}%`;
            document.getElementById('fontFamily').value = this.currentFontFamily;
            document.getElementById('fontSize').value = this.currentFontSize;
            document.getElementById('boldBtn').classList.remove('active');
            document.getElementById('italicBtn').classList.remove('active');
            document.getElementById('underlineBtn').classList.remove('active');
        }
        
        // Gérer l'affichage du panneau de texte en fonction de l'outil sélectionné
        if (this.currentTool === 'text') {
            textPropertiesPanel.style.display = 'block';
            if (activeObject && (activeObject.type !== 'i-text' && activeObject.type !== 'text')) {
                 // Si l'outil texte est actif mais qu'une forme est sélectionnée, on masque l'épaisseur pour cette forme.
                 if (strokeWidthGroup) strokeWidthGroup.style.display = 'none';
            } else if (!activeObject) {
                 // Si outil texte actif et rien de sélectionné, on masque aussi l'épaisseur.
                 if (strokeWidthGroup) strokeWidthGroup.style.display = 'none';
            }
        } else if (!activeObject || (activeObject.type !== 'i-text' && activeObject.type !== 'text')) {
            // Si un autre outil est sélectionné, et qu'un objet non-texte est actif, ou rien n'est actif.
            textPropertiesPanel.style.display = 'none';
             if (strokeWidthGroup) strokeWidthGroup.style.display = 'block'; // Assurer que l'épaisseur est visible pour les formes
        }
    }

    // Nouvelle fonction centrale pour appliquer le zoom/échelle
    applyCanvasScaleAndObjects(oldCanvasScale) {
        if (typeof logInfo === 'function') {
            logInfo(`[SCALE] Applying. Base: ${this.baseCanvasWidth}x${this.baseCanvasHeight}, OldS: ${oldCanvasScale}, NewS: ${this.currentCanvasScale}`);
        }

        const newCanvasWidth = this.baseCanvasWidth * this.currentCanvasScale;
        const newCanvasHeight = this.baseCanvasHeight * this.currentCanvasScale;

        this.canvas.setWidth(newCanvasWidth);
        this.canvas.setHeight(newCanvasHeight);

        // L'élément HTML canvas est aussi redimensionné par setWidth/setHeight de Fabric.

        const scaleFactor = this.currentCanvasScale / oldCanvasScale;

        // Mettre à l'échelle l'image de fond
        if (this.originalImage) {
            this.originalImage.scaleX = this.currentCanvasScale; 
            this.originalImage.scaleY = this.currentCanvasScale;
            
            // Ajuster la position selon l'échelle
            this.originalImage.left = (this.originalImage.left || 0) * scaleFactor;
            this.originalImage.top = (this.originalImage.top || 0) * scaleFactor;
            
            // S'assurer que l'image est dans le canvas (pas en arrière-plan)
            if (!this.canvas.contains(this.originalImage)) {
                this.canvas.add(this.originalImage);
            }
            
            // S'assurer qu'elle reste en arrière-plan
            this.canvas.sendToBack(this.originalImage);
        }
        
        // Définir un fond de canvas uniforme
        this.canvas.backgroundColor = '#ffffff';

        // Mettre à l'échelle tous les autres objets
        const objects = this.canvas.getObjects();
        objects.forEach(obj => {
            // Les coordonnées et échelles des objets sont relatives au canevas Fabric,
            // dont la "taille" logique ne change pas, mais dont le contenu est rendu à une échelle différente.
            // Ici, nous mettons directement à l'échelle les propriétés des objets.
            obj.left *= scaleFactor;
            obj.top *= scaleFactor;
            obj.scaleX *= scaleFactor;
            obj.scaleY *= scaleFactor;
            
            // Recalculer les contrôles pour que leur taille reste constante visuellement
            obj.setCoords(); 
        });

        this.canvas.renderAll();
        this.updateZoomDisplay();
    }

    /**
     * Ouvre le sélecteur d'images pour la fusion
     */
    openMergeImageSelector() {
        // Utiliser le système de modal unifié existant
        if (typeof UnifiedModals !== 'undefined' && UnifiedModals.mergeImageSelector) {
            UnifiedModals.mergeImageSelector.show(this);
        } else {
            // Fallback : créer une modal simple
            this.createSimpleMergeModal();
        }
    }
    
    /**
     * Crée une modal simple pour la sélection d'images
     */
    createSimpleMergeModal() {
        // Récupérer toutes les images disponibles depuis l'état de l'application
        const availableImages = [];
        
        // Collecter les images depuis toutes les sections
        if (window.appState && window.appState.sections) {
            window.appState.sections.forEach(section => {
                if (section.images && section.images.length > 0) {
                    section.images.forEach(img => {
                        availableImages.push({
                            ...img,
                            sectionName: section.name || `Section ${section.sectionNumber}`
                        });
                    });
                }
            });
        }
        
        // Ajouter les images non attribuées
        if (window.appState && window.appState.unassignedImages) {
            window.appState.unassignedImages.forEach(img => {
                availableImages.push({
                    ...img,
                    sectionName: 'Non attribuées'
                });
            });
        }
        
        if (availableImages.length === 0) {
            this.showError('Aucune image disponible pour la fusion');
            return;
        }
        
        // Créer le contenu HTML
        let modalContent = `
            <div class="merge-selector-content">
                <h5>Sélectionner des images à fusionner</h5>
                <div class="merge-images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 400px; overflow-y: auto; padding: 10px;">
        `;
        
        availableImages.forEach((img, index) => {
            modalContent += `
                <div class="merge-image-item" style="cursor: pointer; border: 2px solid transparent; border-radius: 8px; overflow: hidden; transition: all 0.2s;" data-image-index="${index}">
                    <img src="/image/${window.appState.documentName}/${img.filename}" style="width: 100%; height: 100px; object-fit: cover;" alt="${img.filename}">
                    <div style="padding: 5px; font-size: 0.8em; text-align: center; color: white;">
                        <div>${img.filename}</div>
                        <div style="font-size: 0.7em; opacity: 0.7;">${img.sectionName}</div>
                    </div>
                </div>
            `;
        });
        
        modalContent += `
                </div>
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn btn-secondary" onclick="imageEditor.closeMergeModal()">Annuler</button>
                    <button class="btn btn-primary" onclick="imageEditor.addSelectedImagesToCanvas()">Ajouter les images</button>
                </div>
            </div>
        `;
        
        // Stocker temporairement les images disponibles
        this.tempAvailableImages = availableImages;
        
        // Créer et afficher la modal
        this.showMergeModal(modalContent);
    }
    
    /**
     * Affiche la modal de fusion
     */
    showMergeModal(content) {
        // Créer un overlay simple
        const overlay = document.createElement('div');
        overlay.id = 'mergeModalOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--dark-blue, #0f172a);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 12px;
            padding: 20px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow: auto;
        `;
        modal.innerHTML = content;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Gérer la sélection des images
        this.setupMergeImageSelection();
    }
    
    /**
     * Configure la sélection des images dans la modal
     */
    setupMergeImageSelection() {
        const imageItems = document.querySelectorAll('.merge-image-item');
        
        imageItems.forEach(item => {
            item.addEventListener('click', function() {
                this.classList.toggle('selected');
                this.style.borderColor = this.classList.contains('selected') ? '#3b82f6' : 'transparent';
                this.style.backgroundColor = this.classList.contains('selected') ? 'rgba(59, 130, 246, 0.2)' : 'transparent';
            });
        });
    }
    
    /**
     * Ferme la modal de fusion
     */
    closeMergeModal() {
        const overlay = document.getElementById('mergeModalOverlay');
        if (overlay) {
            overlay.remove();
        }
        // Nettoyer les images temporaires
        this.tempAvailableImages = [];
    }
    
    /**
     * Ajoute les images sélectionnées au canvas
     */
    addSelectedImagesToCanvas() {
        const selectedItems = document.querySelectorAll('.merge-image-item.selected');
        
        if (selectedItems.length === 0) {
            this.showError('Veuillez sélectionner au moins une image');
            return;
        }
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offset = 20; // Décalage entre les images
        
        selectedItems.forEach((item, index) => {
            const imageIndex = parseInt(item.dataset.imageIndex);
            const imageData = this.tempAvailableImages[imageIndex];
            
            if (imageData) {
                const imagePath = `/image/${window.appState.documentName}/${imageData.filename}`;
                
                // Ajouter l'image au canvas avec Fabric.js
                fabric.Image.fromURL(imagePath, (img) => {
                    // Redimensionner si l'image est trop grande
                    const maxSize = 300;
                    if (img.width > maxSize || img.height > maxSize) {
                        const scale = maxSize / Math.max(img.width, img.height);
                        img.scaleX = scale;
                        img.scaleY = scale;
                    }
                    
                    // Positionner avec un léger décalage pour chaque image
                    img.set({
                        left: centerX + (index * offset) - (img.width * img.scaleX / 2),
                        top: centerY + (index * offset) - (img.height * img.scaleY / 2),
                        originX: 'left',
                        originY: 'top',
                        // Propriétés pour identifier les images fusionnées
                        isMergedImage: true,
                        mergedImageFilename: imageData.filename
                    });
                    
                    this.canvas.add(img);
                    this.mergedImages.push(img);
                    
                    // Activer la sélection sur la dernière image ajoutée
                    if (index === selectedItems.length - 1) {
                        this.canvas.setActiveObject(img);
                        this.canvas.renderAll();
                    }
                }, { crossOrigin: 'anonymous' });
            }
        });
        
        // Fermer la modal
        this.closeMergeModal();
        
        // Revenir à l'outil de sélection
        this.setTool('select');
        
        if (typeof logInfo === 'function') {
            logInfo(`✅ ${selectedItems.length} image(s) ajoutée(s) pour fusion`);
        }
    }
    
    /**
     * Active/désactive le mode de redimensionnement du canvas
     */
    toggleCanvasResizeMode() {
        // Au lieu d'activer un mode complexe, ouvrir directement une boîte de dialogue
        this.showSimpleResizeDialog();
    }
    
    /**
     * Affiche une boîte de dialogue simple pour redimensionner le canvas
     */
    showSimpleResizeDialog() {
        console.log("Ouverture de la boîte de dialogue de redimensionnement V4 (8 poignées)");
        
        const initialWidth = this.baseCanvasWidth;
        const initialHeight = this.baseCanvasHeight;
        const initialAspectRatio = initialWidth / initialHeight;

        // --- Préparation de la prévisualisation des images ---
        let imagePreviewsHTML = '';
        const previewAreaWidth = 350; // Largeur fixe de la zone de prévisualisation
        const previewBoxInitialWidth = 200;
        const scaleFactor = previewBoxInitialWidth / initialWidth;

        this.canvas.getObjects().forEach(obj => {
            if (obj.type === 'image') {
                const objWidth = obj.width * obj.scaleX;
                const objHeight = obj.height * obj.scaleY;
                imagePreviewsHTML += `<div class="image-pos-preview" style="left: ${obj.left * scaleFactor}px; top: ${obj.top * scaleFactor}px; width: ${objWidth * scaleFactor}px; height: ${objHeight * scaleFactor}px; background-color: ${obj.isOriginalImage ? 'rgba(59,130,246,0.4)' : 'rgba(22,163,74,0.5)'}; border: 1px solid ${obj.isOriginalImage ? 'rgba(59,130,246,0.7)' : 'rgba(22,163,74,0.8)'};"></div>`;
            }
        });

        const modalContent = `
            <div class="resize-dialog">
                <h3>Redimensionner le canvas</h3>
                <div class="resize-preview-area">
                    <div id="resizePreviewBox" style="width: ${previewBoxInitialWidth}px; height: ${previewBoxInitialWidth / initialAspectRatio}px;">
                        ${imagePreviewsHTML}
                        <div class="resize-handle" data-position="tl"></div> <div class="resize-handle" data-position="tm"></div> <div class="resize-handle" data-position="tr"></div>
                        <div class="resize-handle" data-position="ml"></div>                                                    <div class="resize-handle" data-position="mr"></div>
                        <div class="resize-handle" data-position="bl"></div> <div class="resize-handle" data-position="bm"></div> <div class="resize-handle" data-position="br"></div>
                    </div>
                </div>
                <div class="resize-form">
                    <div class="form-group"><label for="canvasWidth">Largeur (px):</label><input type="number" id="canvasWidth" value="${initialWidth}" min="100" max="3000"></div>
                    <div class="form-group"><label for="canvasHeight">Hauteur (px):</label><input type="number" id="canvasHeight" value="${initialHeight}" min="100" max="3000"></div>
                    <div class="form-group-checkbox"><input type="checkbox" id="keepAspectRatio" checked><label for="keepAspectRatio">Conserver le ratio</label></div>
                </div>
                <div class="form-actions"><button id="applyResizeBtn" class="btn btn-primary">Appliquer</button><button id="cancelResizeBtn" class="btn btn-secondary">Annuler</button></div>
            </div>
        `;

        const resizeContainer = document.createElement('div');
        resizeContainer.id = 'resizeDialogContainer';
        document.body.appendChild(resizeContainer);

        const style = document.createElement('style');
        style.id = 'resize-modal-style';
        style.textContent = `
            #resizeDialogContainer { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 99999; }
            .resize-dialog { background-color: #0f172a; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 25px; width: 400px; color: white; box-shadow: 0 5px 25px rgba(0,0,0,0.4); }
            .resize-preview-area { position: relative; height: 250px; margin-bottom: 20px; padding: 10px; background-color: rgba(15, 23, 42, 0.5); border-radius: 6px; user-select: none; }
            #resizePreviewBox { position: absolute; background-color: rgba(255,255,255,0.05); border: 1px dashed rgba(59, 130, 246, 0.5); }
            .image-pos-preview { position: absolute; box-sizing: border-box; }
            .resize-handle { position: absolute; width: 12px; height: 12px; background-color: #3b82f6; border: 2px solid white; border-radius: 50%; z-index: 10; }
            .resize-handle[data-position=tl] { top: -6px; left: -6px; cursor: nwse-resize; } .resize-handle[data-position=tm] { top: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; } .resize-handle[data-position=tr] { top: -6px; right: -6px; cursor: nesw-resize; }
            .resize-handle[data-position=ml] { top: 50%; left: -6px; transform: translateY(-50%); cursor: ew-resize; } .resize-handle[data-position=mr] { top: 50%; right: -6px; transform: translateY(-50%); cursor: ew-resize; }
            .resize-handle[data-position=bl] { bottom: -6px; left: -6px; cursor: nesw-resize; } .resize-handle[data-position=bm] { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; } .resize-handle[data-position=br] { bottom: -6px; right: -6px; cursor: nwse-resize; }
            .resize-form { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: center; }
            .form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        `;
        document.head.appendChild(style);
        resizeContainer.innerHTML = modalContent;

        const cleanup = () => {
            if (document.body.contains(resizeContainer)) {
                document.body.removeChild(resizeContainer);
            }
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        };
        const widthInput = document.getElementById('canvasWidth');
        const heightInput = document.getElementById('canvasHeight');
        const previewBox = document.getElementById('resizePreviewBox');
        const handles = resizeContainer.querySelectorAll('.resize-handle');
        const keepRatioCheckbox = document.getElementById('keepAspectRatio');
        let isDragging = false;
        
        // Centrer la preview box
        const previewArea = resizeContainer.querySelector('.resize-preview-area');
        previewBox.style.left = `${(previewArea.offsetWidth - previewBox.offsetWidth) / 2}px`;
        previewBox.style.top = `${(previewArea.offsetHeight - previewBox.offsetHeight) / 2}px`;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDragging = true;
                
                const handlePos = handle.dataset.position;
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = previewBox.offsetLeft;
                const startTop = previewBox.offsetTop;
                const startWidth = previewBox.offsetWidth;
                const startHeight = previewBox.offsetHeight;

                const doDrag = (moveEvent) => {
                    let dx = moveEvent.clientX - startX;
                    let dy = moveEvent.clientY - startY;
                    let newWidth = startWidth, newHeight = startHeight, newLeft = startLeft, newTop = startTop;

                    if (handlePos.includes('r')) newWidth = startWidth + dx;
                    if (handlePos.includes('l')) { newWidth = startWidth - dx; newLeft = startLeft + dx; }
                    if (handlePos.includes('b')) newHeight = startHeight + dy;
                    if (handlePos.includes('t')) { newHeight = startHeight - dy; newTop = startTop + dy; }

                    if (keepRatioCheckbox.checked) {
                        if (handlePos.length === 2) { // Coin
                            if (Math.abs(dx) > Math.abs(dy)) {
                                newHeight = newWidth / initialAspectRatio;
                            } else {
                                newWidth = newHeight * initialAspectRatio;
                            }
                        } else { // Côté
                            if (handlePos === 't' || handlePos === 'b') newWidth = newHeight * initialAspectRatio;
                            else newHeight = newWidth / initialAspectRatio;
                        }
                        if (handlePos.includes('l')) newLeft = (startLeft + startWidth) - newWidth;
                        if (handlePos.includes('t')) newTop = (startTop + startHeight) - newHeight;
                    }
                    
                    previewBox.style.width = `${newWidth}px`; previewBox.style.height = `${newHeight}px`;
                    previewBox.style.left = `${newLeft}px`; previewBox.style.top = `${newTop}px`;
                    
                    const finalScale = newWidth / initialWidth;
                    widthInput.value = Math.round(newWidth / scaleFactor);
                    heightInput.value = Math.round(newHeight / scaleFactor);
                };

                const stopDrag = () => {
                    document.removeEventListener('mousemove', doDrag);
                    document.removeEventListener('mouseup', stopDrag);
                    setTimeout(() => { isDragging = false; }, 0);
                };
                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            });
        });

        document.getElementById('applyResizeBtn').addEventListener('click', () => {
            const newWidth = parseInt(widthInput.value);
            const newHeight = parseInt(heightInput.value);
            if (newWidth >= 100 && newWidth <= 3000 && newHeight >= 100 && newHeight <= 3000) {
                this.saveState();
                this.baseCanvasWidth = newWidth;
                this.baseCanvasHeight = newHeight;
                this.applyCanvasScaleAndObjects(this.currentCanvasScale);
                cleanup();
                this.showToast('Canvas redimensionné avec succès', 'success');
            }
        });
        
        document.getElementById('cancelResizeBtn').addEventListener('click', cleanup);
        resizeContainer.addEventListener('click', (e) => {
            if (!isDragging && e.target === resizeContainer) {
                cleanup();
            }
        });
    }
    
    /**
     * Affiche le dialogue d'expansion
     */
    showExpandDialog(content) {
        const overlay = document.createElement('div');
        overlay.id = 'expandDialogOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--dark-blue, #0f172a);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 12px;
            padding: 20px;
            max-width: 500px;
            width: 90%;
        `;
        dialog.innerHTML = content;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Gérer la sélection de position
        this.setupPositionSelection();
        this.selectedPosition = 'center';
    }
    
    /**
     * Configure la sélection de position
     */
    setupPositionSelection() {
        const positionBtns = document.querySelectorAll('.position-btn');
        
        positionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Retirer la classe active de tous les boutons
                positionBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'rgba(59, 130, 246, 0.2)';
                    b.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                });
                
                // Ajouter la classe active au bouton cliqué
                btn.classList.add('active');
                btn.style.background = 'rgba(59, 130, 246, 0.4)';
                btn.style.borderColor = 'rgba(59, 130, 246, 0.6)';
                
                this.selectedPosition = btn.dataset.position;
            });
        });
    }
    
    /**
     * Ferme le dialogue d'expansion
     */
    closeExpandDialog() {
        const overlay = document.getElementById('expandDialogOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    /**
     * Applique l'expansion du canvas
     */
    applyCanvasExpansion() {
        const newWidth = parseInt(document.getElementById('newCanvasWidth').value);
        const newHeight = parseInt(document.getElementById('newCanvasHeight').value);
        
        if (newWidth < this.baseCanvasWidth || newHeight < this.baseCanvasHeight) {
            this.showError('La nouvelle taille doit être supérieure à la taille actuelle');
            return;
        }
        
        // Calculer la nouvelle position de l'image de fond et des objets
        let offsetX = 0;
        let offsetY = 0;
        
        switch (this.selectedPosition) {
            case 'top-left':
                offsetX = 0;
                offsetY = 0;
                break;
            case 'top-center':
                offsetX = (newWidth - this.baseCanvasWidth) / 2;
                offsetY = 0;
                break;
            case 'top-right':
                offsetX = newWidth - this.baseCanvasWidth;
                offsetY = 0;
                break;
            case 'center-left':
                offsetX = 0;
                offsetY = (newHeight - this.baseCanvasHeight) / 2;
                break;
            case 'center':
                offsetX = (newWidth - this.baseCanvasWidth) / 2;
                offsetY = (newHeight - this.baseCanvasHeight) / 2;
                break;
            case 'center-right':
                offsetX = newWidth - this.baseCanvasWidth;
                offsetY = (newHeight - this.baseCanvasHeight) / 2;
                break;
            case 'bottom-left':
                offsetX = 0;
                offsetY = newHeight - this.baseCanvasHeight;
                break;
            case 'bottom-center':
                offsetX = (newWidth - this.baseCanvasWidth) / 2;
                offsetY = newHeight - this.baseCanvasHeight;
                break;
            case 'bottom-right':
                offsetX = newWidth - this.baseCanvasWidth;
                offsetY = newHeight - this.baseCanvasHeight;
                break;
        }
        
        // Mettre à jour les dimensions de base
        this.baseCanvasWidth = newWidth;
        this.baseCanvasHeight = newHeight;
        
        // Déplacer tous les objets existants
        const objects = this.canvas.getObjects();
        objects.forEach(obj => {
            if (obj !== this.originalImage) {
                obj.left += offsetX;
                obj.top += offsetY;
                obj.setCoords();
            }
        });
        
        // Déplacer l'image de fond si nécessaire
        if (this.originalImage) {
            this.originalImage.left = offsetX;
            this.originalImage.top = offsetY;
        }
        
        // Appliquer les nouvelles dimensions
        const oldScale = this.currentCanvasScale;
        this.applyCanvasScaleAndObjects(oldScale);
        
        // Fermer le dialogue
        this.closeExpandDialog();
        
        // Sauvegarder l'état
        this.saveState();
        
        if (typeof logInfo === 'function') {
            logInfo(`✅ Canvas agrandi à ${newWidth}x${newHeight} pixels`);
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
console.log('📝 Image Editor chargé et prêt'); 