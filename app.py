import os
import re
import base64
import fitz  # PyMuPDF
from flask import Flask, render_template, request, redirect, url_for, flash, send_file, jsonify
from werkzeug.utils import secure_filename
import zipfile
from io import BytesIO
import json
from datetime import datetime
from PIL import Image
import numpy as np
import hashlib
import uuid
from collections import defaultdict
from ai_indexing import get_indexer, test_api_connection

# Charger les variables d'environnement depuis le fichier .env
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Fichier .env chargé avec succès")
except ImportError:
    print("⚠️ python-dotenv non disponible, utilisation des variables d'environnement système")
except Exception as e:
    print(f"⚠️ Erreur lors du chargement du .env: {e}")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'votre_cle_secrete_ici'
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'extracted_images'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

# Créer les dossiers nécessaires
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def detect_sections(pdf_document):
    """
    Détecte les sections ET sous-sections numérotées du document PDF
    Algorithme amélioré avec meilleure gestion des sous-sections
    """
    sections = []
    potential_sections = []
    
    # Patterns spécialisés pour détecter sections et sous-sections
    section_patterns = [
        # Patterns principaux identifiés dans l'analyse
        r'^(\d+)\.\s+(.{3,100})$',           # 1. TITRE (pattern principal)
        r'^(\d+\.\d+)\.\s+(.{3,100})$',      # 1.1. TITRE (sous-sections)
        r'^(\d+\.\d+\.\d+)\.\s+(.{3,100})$', # 1.1.1. TITRE (sous-sous-sections)
        
        # Patterns alternatifs
        r'^(\d+)\s+(.{3,100})$',             # 1 TITRE (sans point)
        r'^(\d+\.\d+)\s+(.{3,100})$',        # 1.1 TITRE (sans point final)
        r'^(\d+\.\d+\.\d+)\s+(.{3,100})$',   # 1.1.1 TITRE (sans point final)
        
        # Patterns avec mots-clés
        r'^SECTION\s+(\d+)\s*[:\-]?\s*(.{3,100})$',
        r'^CHAPITRE\s+(\d+)\s*[:\-]?\s*(.{3,100})$',
        r'^PARTIE\s+(\d+)\s*[:\-]?\s*(.{3,100})$',
    ]
    
    print(f"🔍 Analyse de {len(pdf_document)} pages pour détecter les sections...")
    
    for page_num in range(len(pdf_document)):
        page = pdf_document[page_num]
        blocks = page.get_text("dict")
        
        for block in blocks["blocks"]:
            if "lines" in block:
                for line in block["lines"]:
                    # Reconstituer le texte de la ligne
                    line_text = ""
                    max_font_size = 0
                    is_bold = False
                    total_flags = 0
                    span_count = 0
                    
                    for span in line["spans"]:
                        line_text += span["text"]
                        max_font_size = max(max_font_size, span["size"])
                        total_flags += span["flags"]
                        span_count += 1
                        if span["flags"] & 2**4:  # Gras
                            is_bold = True
                    
                    line_text = line_text.strip()
                    
                    # Critères de base pour qu'une ligne soit candidate
                    if (len(line_text) >= 3 and len(line_text) <= 120 and  # Longueur raisonnable
                        max_font_size >= 10.0 and  # Taille de police suffisante (abaissé pour sous-sections)
                        not line_text.isdigit() and  # Pas juste un chiffre
                        not re.match(r'^\d{1,2}/\d{1,2}/\d{4}', line_text) and  # Pas une date
                        not line_text.lower().startswith(('page ', 'figure ', 'table ', 'annexe', 'login', 'mot de passe'))):
                        
                        # Tester les patterns de section
                        for pattern in section_patterns:
                            match = re.match(pattern, line_text, re.IGNORECASE)
                            if match:
                                section_number = match.group(1)
                                section_title = match.group(2).strip()
                                
                                # Validation supplémentaire du titre
                                if (len(section_title) >= 3 and  # Titre suffisamment long
                                    not re.match(r'^[\d\s\.\-\)\(\[\]]+$', section_title) and  # Pas que des chiffres/symboles
                                    not section_title.lower().startswith(('login', 'mot de passe', 'password', 'user')) and
                                    len([c for c in section_title if c.isalpha()]) >= 3):  # Au moins 3 lettres
                                    
                                    # Calculer le score de qualité de la section
                                    quality_score = 0
                                    
                                    # Bonus pour taille de police importante
                                    if max_font_size >= 16.0:
                                        quality_score += 3
                                    elif max_font_size >= 12.0:
                                        quality_score += 2
                                    elif max_font_size >= 10.0:
                                        quality_score += 1
                                    
                                    # Bonus pour gras
                                    if is_bold:
                                        quality_score += 2
                                    
                                    # Bonus pour titre en majuscules (style administratif)
                                    if section_title.isupper() and len(section_title) > 5:
                                        quality_score += 1
                                    
                                    # Bonus pour numérotation (ajustement pour favoriser les sous-sections)
                                    dots_count = section_number.count('.')
                                    if dots_count == 0:
                                        quality_score += 3  # Section principale
                                    elif dots_count == 1:
                                        quality_score += 2  # Sous-section (préservée)
                                    elif dots_count == 2:
                                        quality_score += 1  # Sous-sous-section
                                    
                                    # Bonus spécial pour les sous-sections bien formées
                                    if '.' in section_number and max_font_size >= 11.0:
                                        quality_score += 1
                                    
                                    # Malus pour certains patterns suspects
                                    if re.search(r'\d{4}', section_title):  # Contient une année
                                        quality_score -= 2
                                    if len(section_title) > 80:  # Titre trop long
                                        quality_score -= 1
                                    
                                    # Calculer le niveau hiérarchique
                                    if '.' in section_number:
                                        level = len(section_number.split('.'))
                                    else:
                                        level = 1
                                    
                                    potential_sections.append({
                                        'number': section_number,
                                        'title': section_title,
                                        'full_title': f"{section_number}. {section_title}",
                                        'page': page_num + 1,
                                        'font_size': max_font_size,
                                        'is_bold': is_bold,
                                        'level': level,
                                        'quality_score': quality_score,
                                        'pattern_used': pattern
                                    })
                                break  # Arrêter après le premier pattern qui matche
    
    # Filtrer et trier les sections par qualité
    print(f"📊 {len(potential_sections)} sections candidates trouvées, filtrage en cours...")
    
    if potential_sections:
        # Trier par score de qualité puis par numéro de section
        potential_sections.sort(key=lambda x: (-x['quality_score'], x['page']))
        
        # Seuil de qualité plus flexible pour les sous-sections
        high_quality_sections = [s for s in potential_sections if s['quality_score'] >= 2]  # Abaissé de 3 à 2
        
        print(f"🎯 {len(high_quality_sections)} sections de haute qualité identifiées")
        
        # Si pas assez de sections, abaisser encore le seuil
        if len(high_quality_sections) < 2:
            high_quality_sections = [s for s in potential_sections if s['quality_score'] >= 1]
            print(f"📝 Seuil abaissé: {len(high_quality_sections)} sections retenues")
        
        # Éliminer les doublons (même numéro de section)
        seen_numbers = set()
        unique_sections = []
        
        for section in high_quality_sections:
            if section['number'] not in seen_numbers:
                seen_numbers.add(section['number'])
                unique_sections.append(section)
        
        # Trier par ordre naturel des numéros de section
        def natural_sort_key(section):
            try:
                # Convertir "1.2.3" en tuple (1, 2, 3) pour tri naturel
                parts = [int(x) for x in section['number'].split('.')]
                # Compléter avec des zéros pour uniformiser
                while len(parts) < 4:
                    parts.append(0)
                return parts
            except:
                return [999, 999, 999, 999]  # Mettre à la fin si erreur
        
        unique_sections.sort(key=natural_sort_key)
        
        # **NOUVELLE LOGIQUE** : Préserver toutes les sections détectées sans consolidation agressive
        consolidated_sections = []
        
        # Mode intelligent : préserver les sous-sections importantes
        main_sections = [s for s in unique_sections if s['level'] == 1]
        sub_sections = [s for s in unique_sections if s['level'] > 1]
        
        if len(main_sections) >= 2:
            print(f"🏗️  Consolidation intelligente: {len(main_sections)} sections principales, {len(sub_sections)} sous-sections")
            
            # Toujours inclure les sections principales
            consolidated_sections.extend(main_sections)
            
            # Ajouter les sous-sections qui méritent d'être préservées
            for sub in sub_sections:
                # Critères plus souples pour préserver les sous-sections
                preserve_subsection = False
                
                # Préserver si score de qualité élevé
                if sub['quality_score'] >= 3:
                    preserve_subsection = True
                    print(f"  ✅ Sous-section préservée (qualité élevée): {sub['number']}")
                
                # Préserver si sur une page différente de sa section parent
                parent_number = sub['number'].split('.')[0]
                parent_section = next((s for s in main_sections if s['number'] == parent_number), None)
                if parent_section and sub['page'] != parent_section['page']:
                    preserve_subsection = True
                    print(f"  ✅ Sous-section préservée (page différente): {sub['number']}")
                
                # Préserver si la sous-section a une taille de police significative
                if sub['font_size'] >= 12.0 and sub['is_bold']:
                    preserve_subsection = True
                    print(f"  ✅ Sous-section préservée (format important): {sub['number']}")
                
                if preserve_subsection:
                    consolidated_sections.append(sub)
                else:
                    print(f"  🔄 Sous-section fusionnée avec parent: {sub['number']}")
        else:
            # Pas assez de sections principales, garder toutes les sections de qualité
            consolidated_sections = unique_sections
            print(f"🏗️  Mode simple: {len(consolidated_sections)} sections conservées")
        
        # Re-trier après consolidation
        consolidated_sections.sort(key=natural_sort_key)
        
        # Calculer les plages de pages pour chaque section
        for i, section in enumerate(consolidated_sections):
            start_page = section['page']
            
            # Trouver la page de fin en regardant la section suivante de même niveau ou supérieur
            end_page = len(pdf_document)  # Par défaut jusqu'à la fin
            current_level = section['level']
            
            # Chercher la prochaine section de niveau égal ou supérieur
            for j in range(i + 1, len(consolidated_sections)):
                next_section = consolidated_sections[j]
                next_level = next_section['level']
                
                # Si on trouve une section de même niveau ou supérieur (moins profonde)
                if next_level <= current_level:
                    end_page = next_section['page'] - 1
                    break
            
            # S'assurer qu'on a au moins une page
            if end_page < start_page:
                end_page = start_page
            
            sections.append({
                'number': section['number'],
                'title': section['full_title'][:100],  # Limiter la longueur
                'start_page': start_page,
                'end_page': end_page,
                'level': current_level
            })
    
    # Si aucune section de qualité trouvée, créer des sections par défaut
    if not sections:
        print("⚠️  Aucune section de qualité détectée, création de sections par défaut")
        total_pages = len(pdf_document)
        
        # Pour les petits documents, une seule section
        if total_pages <= 5:
            sections = [{
                'number': '1',
                'title': '1. Document',
                'start_page': 1,
                'end_page': total_pages,
                'level': 1
            }]
        else:
            # Pour les documents plus longs, diviser intelligemment
            pages_per_section = max(3, total_pages // 4)  # Au moins 3 pages par section
            section_num = 1
            
            for start in range(1, total_pages + 1, pages_per_section):
                end = min(start + pages_per_section - 1, total_pages)
                sections.append({
                    'number': str(section_num),
                    'title': f'{section_num}. Section {section_num}',
                    'start_page': start,
                    'end_page': end,
                    'level': 1
                })
                section_num += 1
    
    # Affichage des résultats avec indentation pour montrer la hiérarchie
    print(f"\n✅ {len(sections)} sections finales détectées:")
    for section in sections:
        level_indent = "  " * (section.get('level', 1) - 1)
        if section.get('level', 1) == 1:
            icon = "📖"
        elif section.get('level', 1) == 2:
            icon = "📄"
        else:
            icon = "📝"
        print(f"  {level_indent}{icon} {section['number']}: {section['title']} (pages {section['start_page']}-{section['end_page']})")
    
    return sections

def calculate_image_hash(image_data):
    """Calcule un hash perceptuel pour détecter les images vraiment identiques"""
    try:
        # Ouvrir l'image
        img = Image.open(BytesIO(image_data))
        
        # Hash plus précis : 16x16 pixels au lieu de 8x8
        img = img.convert('L').resize((16, 16), Image.LANCZOS)
        
        # Calculer le hash perceptuel (average hash)
        pixels = list(img.getdata())
        avg = sum(pixels) / len(pixels)
        hash_bits = ''.join('1' if pixel > avg else '0' for pixel in pixels)
        
        return hash_bits
    except Exception as e:
        print(f"Erreur calcul hash: {e}")
        return None

def are_images_similar(hash1, hash2, threshold=25):
    """Compare deux hashs et retourne True si les images sont vraiment identiques"""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return False
    
    # Compter les différences bit par bit
    differences = sum(c1 != c2 for c1, c2 in zip(hash1, hash2))
    
    # Avec hash 16x16 (256 bits), seuil optimisé :
    # 25 bits sur 256 = ~10% de différence maximum (plus réaliste pour éviter les faux positifs)
    return differences <= threshold

def filter_duplicate_images(image_data_list, min_occurrences=6):
    """
    Filtre les images qui apparaissent plus de min_occurrences fois
    (logos, headers, footers, etc.) en conservant le meilleur exemplaire
    """
    print(f"\n🔍 Analyse des images dupliquées...")
    
    # Calculer les hashs pour toutes les images
    image_hashes = []
    for i, (image_data, metadata) in enumerate(image_data_list):
        hash_value = calculate_image_hash(image_data)
        if hash_value:
            image_hashes.append({
                'index': i,
                'hash': hash_value,
                'metadata': metadata,
                'data': image_data
            })
    
    # Grouper les images similaires
    duplicate_groups = []
    processed_indices = set()
    
    for i, img1 in enumerate(image_hashes):
        if i in processed_indices:
            continue
            
        group = [img1]
        processed_indices.add(i)
        
        for j, img2 in enumerate(image_hashes[i+1:], i+1):
            if j in processed_indices:
                continue
                
            if are_images_similar(img1['hash'], img2['hash']):
                group.append(img2)
                processed_indices.add(j)
        
        if len(group) > 1:
            duplicate_groups.append(group)
    
    # Identifier les images à filtrer (nouvelle logique : conserver le meilleur)
    filtered_indices = set()
    for group in duplicate_groups:
        if len(group) >= min_occurrences:
            print(f"  📋 Groupe d'images dupliquées détecté: {len(group)} occurrences")
            print(f"     Exemple: page {group[0]['metadata']['page']}")
            
            # Trouver le meilleur exemplaire (par taille d'image)
            best_img = max(group, key=lambda img: len(img['data']))
            print(f"     Meilleur exemplaire conservé: page {best_img['metadata']['page']} ({len(best_img['data'])} bytes)")
            
            # Marquer les autres pour filtrage (pas le meilleur)
            for img in group:
                if img['index'] != best_img['index']:
                    filtered_indices.add(img['index'])
    
    # Retourner les images non-filtrées
    filtered_images = []
    for i, (image_data, metadata) in enumerate(image_data_list):
        if i not in filtered_indices:
            filtered_images.append((image_data, metadata))
    
    filtered_count = len(image_data_list) - len(filtered_images)
    print(f"  ✅ {filtered_count} images dupliquées filtrées")
    print(f"  ✅ {len(filtered_images)} images uniques conservées")
    
    return filtered_images

def extract_images_from_pdf(pdf_path, output_folder, document_name, filter_duplicates=True, detect_hierarchy=True):
    """
    Extrait les images du PDF en respectant la nomenclature
    CRL-[NOM DU DOC]-X.X.X n_Y.jpg avec filtrage des images dupliquées
    """
    pdf_document = fitz.open(pdf_path)
    
    # Utiliser le nom de document fourni
    clean_filename = document_name
    
    # Détecter les sections selon l'option
    if detect_hierarchy:
        sections = detect_sections(pdf_document)
    else:
        # Créer des sections par défaut sans hiérarchie
        total_pages = len(pdf_document)
        pages_per_section = max(5, total_pages // 3)
        sections = []
        section_num = 1
        
        for start in range(1, total_pages + 1, pages_per_section):
            end = min(start + pages_per_section - 1, total_pages)
            sections.append({
                'number': str(section_num),
                'title': f'{section_num}. Section {section_num}',
                'start_page': start,
                'end_page': end,
                'level': 1
            })
            section_num += 1
    
    # Première passe : collecter toutes les images avec leurs métadonnées
    all_images_data = []
    
    for page_num in range(len(pdf_document)):
        page = pdf_document[page_num]
        
        # Trouver toutes les sections qui couvrent cette page
        page_sections = []
        for section in sections:
            if section['start_page'] <= page_num + 1 <= section['end_page']:
                page_sections.append(section)
        
        # Trier par niveau (privilégier les sous-sections) puis par numéro
        if page_sections:
            def section_priority(section):
                level = section.get('level', 1)
                try:
                    # Convertir le numéro de section en tuple pour tri naturel
                    parts = [int(x) for x in section['number'].split('.')]
                    while len(parts) < 4:
                        parts.append(0)
                    return (-level, parts)  # Niveau négatif pour trier par niveau décroissant
                except:
                    return (-level, [999, 999, 999, 999])
            
            page_sections.sort(key=section_priority)
        
        if not page_sections:
            page_sections = [sections[0]]  # Section par défaut
        
        # Obtenir les images de la page
        image_list = page.get_images()
        
        # Distribuer intelligemment les images entre les sections de la page
        for img_index, img in enumerate(image_list):
            try:
                # Extraire l'image avec annotations intégrées
                xref = img[0]
                
                # Extraction directe de l'image (méthode plus fiable)
                try:
                    # Extraction directe sans utiliser get_image_rects qui peut être imprécise
                    pix = fitz.Pixmap(pdf_document, xref)
                    print(f"  📷 Image {img_index+1} extraite (méthode directe)")
                    
                except Exception as e:
                    # En cas d'erreur, ignorer cette image
                    print(f"  ❌ Erreur extraction image {img_index+1}: {str(e)}")
                    continue
                
                # Convertir en RGB si nécessaire
                if pix.n - pix.alpha < 4:
                    img_data = pix.pil_tobytes(format="PNG")
                else:
                    pix_rgb = fitz.Pixmap(fitz.csRGB, pix)
                    img_data = pix_rgb.pil_tobytes(format="PNG")
                    pix_rgb = None
                
                # Choisir la section pour cette image
                # Si plusieurs sous-sections sur la page, distribuer en round-robin
                if len(page_sections) == 1:
                    assigned_section = page_sections[0]
                else:
                    # Séparer les sous-sections des sections principales
                    subsections = [s for s in page_sections if s.get('level', 1) > 1]
                    main_sections = [s for s in page_sections if s.get('level', 1) == 1]
                    
                    if subsections:
                        # Distribuer entre les sous-sections en round-robin
                        assigned_section = subsections[img_index % len(subsections)]
                        print(f"  🎯 Image {img_index+1} assignée à la sous-section {assigned_section['number']}")
                    else:
                        # Pas de sous-sections, utiliser la première section principale
                        assigned_section = main_sections[0] if main_sections else page_sections[0]
                
                # Métadonnées de l'image
                metadata = {
                    'page': page_num + 1,
                    'section': assigned_section,
                    'img_index': img_index,
                    'xref': xref
                }
                
                all_images_data.append((img_data, metadata))
                pix = None
                
            except Exception as e:
                print(f"Erreur lors de l'extraction de l'image {img_index} de la page {page_num + 1}: {str(e)}")
                continue
    
    # Filtrer les images dupliquées selon l'option
    if filter_duplicates:
        filtered_images = filter_duplicate_images(all_images_data, min_occurrences=4)
    else:
        filtered_images = all_images_data
        print(f"🔍 Filtrage désactivé - {len(filtered_images)} images conservées")
    
    # Deuxième passe : sauvegarder les images filtrées avec UIDs uniques
    extracted_files = []
    
    for image_data, metadata in filtered_images:
        current_section = metadata['section']
        section_number = current_section['number']
        
        # ARCHITECTURE V3.0 : Génération d'UID unique pour identifiant physique IMMUABLE
        unique_id = str(uuid.uuid4())[:8]  # 8 premiers caractères de l'UUID
        filename = f"{unique_id}.jpg"
        filepath = os.path.join(output_folder, filename)
        
        # Sauvegarder l'image en JPEG
        img_pil = Image.open(BytesIO(image_data))
        if img_pil.mode in ('RGBA', 'LA', 'P'):
            img_pil = img_pil.convert('RGB')
        img_pil.save(filepath, 'JPEG', quality=95)
        
        extracted_files.append({
            'filename': filename,  # UID unique (exemple: a1b2c3d4.jpg)
            'uid': unique_id,      # UID pur pour référence
            'path': filepath,
            'section': section_number,       # Métadonnée : section détectée
            'section_title': current_section['title'],  # Métadonnée : titre section
            'page': metadata['page'],        # Métadonnée : numéro de page
            'image_number': 1                # Métadonnée : sera calculée côté client
        })
    
    pdf_document.close()
    
    return {
        'sections': sections,
        'extracted_files': extracted_files,
        'total_images': len(extracted_files),
        'filtered_count': len(all_images_data) - len(filtered_images)
    }

@app.route('/image/<path:folder_name>/<path:filename>')
def serve_image(folder_name, filename):
    """Servir les images extraites pour le preview"""
    try:
        image_path = os.path.join(app.config['OUTPUT_FOLDER'], folder_name, filename)
        print(f"🖼️  Tentative de servir l'image: {image_path}")
        
        if os.path.exists(image_path):
            print(f"✅ Image trouvée: {image_path}")
            # Déterminer le type MIME basé sur l'extension
            if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
                mimetype = 'image/jpeg'
            elif filename.lower().endswith('.png'):
                mimetype = 'image/png'
            else:
                mimetype = 'image/jpeg'  # Par défaut
            
            return send_file(image_path, mimetype=mimetype)
        else:
            print(f"❌ Image non trouvée: {image_path}")
            
            # Lister les fichiers disponibles dans le dossier pour debug
            folder_path = os.path.join(app.config['OUTPUT_FOLDER'], folder_name)
            if os.path.exists(folder_path):
                available_files = os.listdir(folder_path)
                print(f"📁 Fichiers disponibles dans {folder_path}: {available_files}")
            else:
                print(f"📁 Dossier non trouvé: {folder_path}")
            
            # Retourner une erreur 404
            return "Image non trouvée", 404
            
    except Exception as e:
        print(f"💥 Erreur lors du service de l'image {filename}: {str(e)}")
        return "Erreur serveur", 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/validation')
def validation_session1():
    """Route pour tester le nouveau ImageDisplayManager"""
    return send_file('validation_session1.html')

@app.route('/test_session2_fix.html')
def test_session2_fix():
    """Route pour tester les corrections du SESSION 2"""
    return send_file('test_session2_fix.html')

@app.route('/test_image_names.html')
def test_image_names():
    """Route pour tester l'extraction des noms purs"""
    return send_file('test_image_names.html')

@app.route('/debug_appstate.html')
def debug_appstate():
    """Route pour debugger la structure appState"""
    return send_file('debug_appstate.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('Aucun fichier sélectionné')
        return redirect(request.url)
    
    file = request.files['file']
    if file.filename == '':
        flash('Aucun fichier sélectionné')
        return redirect(request.url)
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        
        # S'assurer que le dossier d'upload existe
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Récupérer le nom du document configuré par l'utilisateur
        document_name = request.form.get('document_name', '').strip()
        print(f"🔍 DEBUG: document_name reçu du formulaire: '{document_name}'")
        print(f"🔍 DEBUG: request.form complet: {dict(request.form)}")
        
        if not document_name:
            # Si pas de nom configuré, utiliser le nom du fichier sans extension
            document_name = os.path.splitext(filename)[0]
            print(f"🔍 DEBUG: document_name par défaut (nom fichier): '{document_name}'")
        
        # Nettoyer le nom du document (seulement lettres, chiffres, tirets, underscores)
        clean_document_name = re.sub(r'[^\w\-_]', '_', document_name)
        print(f"🔍 DEBUG: clean_document_name final: '{clean_document_name}'")
        
        # Récupérer les options
        filter_duplicates = request.form.get('filter_duplicates') == 'on'
        detect_hierarchy = request.form.get('detect_hierarchy') == 'on'
        
        try:
            # Créer un dossier de sortie spécifique pour ce fichier
            os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)  # S'assurer que le dossier parent existe
            output_subfolder = os.path.join(
                app.config['OUTPUT_FOLDER'], 
                clean_document_name
            )
            os.makedirs(output_subfolder, exist_ok=True)
            
            # Extraire les images avec le nom configuré
            result = extract_images_from_pdf(
                filepath, 
                output_subfolder, 
                document_name=clean_document_name,
                filter_duplicates=filter_duplicates,
                detect_hierarchy=detect_hierarchy
            )
            
            # Ajouter des statistiques pour l'affichage
            result['source_filename'] = filename
            result['document_name'] = clean_document_name
            result['output_folder_name'] = clean_document_name
            
            # Debug des chemins
            print(f"Fichier source: {filename}")
            print(f"Nom du document: {clean_document_name}")
            print(f"Dossier de sortie: {output_subfolder}")
            print(f"Images extraites: {len(result['extracted_files'])}")
            print(f"🔍 DEBUG: result['document_name'] envoyé au template: '{result['document_name']}'")
            
            return render_template('results.html', 
                                 result=result, 
                                 source_filename=filename,
                                 output_folder=output_subfolder)
        
        except Exception as e:
            flash(f'Erreur lors du traitement: {str(e)}')
            return redirect(url_for('index'))
    else:
        flash('Type de fichier non autorisé. Seuls les fichiers PDF sont acceptés.')
        return redirect(url_for('index'))

@app.route('/download/<path:folder_name>')
def download_zip(folder_name):
    """Télécharger toutes les images extraites dans un fichier ZIP"""
    folder_path = os.path.join(app.config['OUTPUT_FOLDER'], folder_name)
    
    if not os.path.exists(folder_path):
        flash('Dossier non trouvé')
        return redirect(url_for('index'))
    
    # Créer un fichier ZIP en mémoire
    memory_file = BytesIO()
    
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, folder_path)
                zf.write(file_path, arcname)
    
    memory_file.seek(0)
    
    return send_file(
        memory_file,
        as_attachment=True,
        download_name=f'{folder_name}_images.zip',
        mimetype='application/zip'
    )

@app.route('/api/images/<path:folder_name>')
def get_images_json(folder_name):
    """API pour récupérer les images en JSON - ARCHITECTURE V3.0 : UIDs uniques"""
    folder_path = os.path.join(app.config['OUTPUT_FOLDER'], folder_name)
    images = []
    
    if os.path.exists(folder_path):
        for filename in os.listdir(folder_path):
            if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                # ARCHITECTURE V3.0 : Les noms sont maintenant des UIDs (exemple: a1b2c3d4.jpg)
                # Les métadonnées sont stockées côté client dans appState
                uid = os.path.splitext(filename)[0]  # Récupérer l'UID sans extension
                
                images.append({
                    'filename': filename,    # UID.jpg
                    'uid': uid,             # UID pur
                    'section': '1',         # Métadonnée par défaut (sera écrasée côté client)
                    'page': 1,              # Métadonnée par défaut (sera écrasée côté client)
                    'image_number': len(images) + 1  # Numéro séquentiel temporaire
                })
    
    return jsonify(images)

@app.route('/export-custom', methods=['POST'])
def export_custom():
    """Export personnalisé basé sur la configuration utilisateur"""
    try:
        config = request.get_json()
        
        # Créer un dossier temporaire pour l'export
        import tempfile
        import shutil
        
        with tempfile.TemporaryDirectory() as temp_dir:
            document_folder = os.path.join(app.config['OUTPUT_FOLDER'], config['documentName'])
            
            # Traiter chaque section
            for section in config['sections']:
                for image_config in section['images']:
                    # Utiliser le nom de fichier actuel sur le disque
                    current_physical_filename = image_config['originalFilename']
                    # Nom souhaité pour le fichier dans le ZIP (déjà correctement formaté par le client)
                    filename_in_zip = image_config['newFilename']
                    
                    current_physical_path = os.path.join(document_folder, current_physical_filename)
                    
                    if os.path.exists(current_physical_path):
                        print(f"[Export] Copie: '{current_physical_path}' -> vers ZIP sous nom: '{filename_in_zip}'")
                        path_in_zip = os.path.join(temp_dir, filename_in_zip)
                        
                        # S'assurer que le dossier parent existe dans temp_dir si filename_in_zip contient des sous-dossiers (peu probable ici)
                        # os.makedirs(os.path.dirname(path_in_zip), exist_ok=True)
                        
                        shutil.copy2(current_physical_path, path_in_zip)
                    else:
                        print(f"[Export] ⚠️ Fichier source non trouvé, ignoré: {current_physical_path}")
            
            # Créer le ZIP
            memory_file = BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, temp_dir)
                        zf.write(file_path, arcname)
            
            memory_file.seek(0)
            
            return send_file(
                memory_file,
                as_attachment=True,
                download_name=f'{config["documentName"]}_custom.zip',
                mimetype='application/zip'
            )
    
    except Exception as e:
        print(f"Erreur lors de l'export personnalisé: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-edited-image', methods=['POST'])
def save_edited_image():
    """Sauvegarde une image éditée"""
    try:
        
        data = request.get_json()
        
        # Valider les données
        if not data or 'original_filename' not in data or 'document_name' not in data or 'edited_image_data' not in data:
            return jsonify({'error': 'Données manquantes'}), 400
        
        original_filename = data['original_filename']
        document_name = data['document_name']
        edited_image_data = data['edited_image_data']
        replace_original = data.get('replace_original', False)
        
        # Décoder l'image base64
        if edited_image_data.startswith('data:'):
            # Supprimer le préfixe data:image/png;base64,
            header, encoded = edited_image_data.split(',', 1)
            image_data = base64.b64decode(encoded)
        else:
            image_data = base64.b64decode(edited_image_data)
        
        # Créer le dossier de destination
        document_folder = os.path.join(app.config['OUTPUT_FOLDER'], document_name)
        os.makedirs(document_folder, exist_ok=True)
        
        original_path = os.path.join(document_folder, original_filename)
        name, ext = os.path.splitext(original_filename)
        
        if replace_original:
            # Mode: Remplacer l'image originale
            if os.path.exists(original_path):
                # Faire une sauvegarde de l'original
                backup_filename = f"{name}_original{ext}"
                backup_path = os.path.join(document_folder, backup_filename)
                if not os.path.exists(backup_path):
                    import shutil
                    shutil.copy2(original_path, backup_path)
                
                # Remplacer par la version éditée
                with open(original_path, 'wb') as f:
                    f.write(image_data)
                
                result_filename = original_filename
            else:
                # Si l'original n'existe pas, créer une nouvelle image
                with open(original_path, 'wb') as f:
                    f.write(image_data)
                result_filename = original_filename
        else:
            # Mode: Créer une nouvelle image
            # Générer un nom unique pour l'image éditée
            counter = 1
            edited_filename = f"{name}_edited{ext}"
            edited_path = os.path.join(document_folder, edited_filename)
            
            # Si le fichier existe déjà, ajouter un numéro
            while os.path.exists(edited_path):
                edited_filename = f"{name}_edited_{counter}{ext}"
                edited_path = os.path.join(document_folder, edited_filename)
                counter += 1
            
            # Sauvegarder la nouvelle image éditée
            with open(edited_path, 'wb') as f:
                f.write(image_data)
            
            result_filename = edited_filename
        
        return jsonify({
            'success': True,
            'filename': result_filename,
            'original_filename': original_filename,
            'replace_original': replace_original,
            'message': 'Image sauvegardée avec succès'
        })
        
    except Exception as e:
        print(f"Erreur lors de la sauvegarde de l'image éditée: {e}")
        return jsonify({'error': 'Erreur lors de la sauvegarde'}), 500

@app.route('/api/ai-indexing/status')
def ai_indexing_status():
    """Vérifie le statut du service d'indexation IA"""
    try:
        indexer = get_indexer()
        is_available = indexer.is_available()
        
        if is_available:
            # Test de connexion optionnel (peut être lent)
            connection_ok = test_api_connection()
            return jsonify({
                'available': True,
                'connection': connection_ok,
                'message': 'Service d\'indexation IA disponible' if connection_ok else 'Clé API configurée mais connexion échouée'
            })
        else:
            return jsonify({
                'available': False,
                'connection': False,
                'message': 'Clé API Mistral non configurée. Définissez la variable d\'environnement MISTRAL_API_KEY.'
            })
    except Exception as e:
        return jsonify({
            'available': False,
            'connection': False,
            'message': f'Erreur lors de la vérification: {str(e)}'
        }), 500

@app.route('/api/ai-indexing/analyze', methods=['POST'])
def ai_indexing_analyze():
    """Analyse une ou plusieurs images via IA"""
    try:
        data = request.get_json()
        
        if not data or 'images' not in data or 'document_name' not in data:
            return jsonify({'error': 'Données manquantes'}), 400
        
        images = data['images']
        document_name = data['document_name']
        
        # Initialiser le service d'indexation
        indexer = get_indexer()
        
        if not indexer.is_available():
            return jsonify({
                'error': 'Service d\'indexation IA non disponible. Vérifiez votre clé API Mistral.'
            }), 503
        
        # Analyser toutes les images d'abord
        raw_results = []
        document_folder = os.path.join(app.config['OUTPUT_FOLDER'], document_name)
        
        for image_filename in images:
            image_path = os.path.join(document_folder, image_filename)
            
            if not os.path.exists(image_path):
                raw_results.append({
                    'filename': image_filename,
                    'success': False,
                    'error': 'Image non trouvée'
                })
                continue
            
            # Analyser l'image
            analysis = indexer.analyze_image(image_path)
            
            if analysis:
                raw_results.append({
                    'filename': image_filename,
                    'success': True,
                    'title': analysis['title'],
                    'tags': analysis['tags']
                })
            else:
                raw_results.append({
                    'filename': image_filename,
                    'success': False,
                    'error': 'Échec de l\'analyse par IA'
                })
        
        # Traiter les résultats réussis directement sans renommage automatique
        successful_results = [r for r in raw_results if r.get('success', False)]
        
        # Reconstituer la liste finale sans modification des titres
        final_results = []
        success_index = 0
        
        for raw_result in raw_results:
            if raw_result.get('success', False):
                result = successful_results[success_index]
                final_results.append({
                    'filename': result['filename'],
                    'success': True,
                    'title': result['title'],
                    'suggested_name': result['title'],  # Titre original sans modification
                    'tags': result['tags'],
                    'suggested_filename': generate_new_filename(result['filename'], result['title'])
                })
                success_index += 1
            else:
                final_results.append(raw_result)
        
        return jsonify({
            'success': True,
            'results': final_results,
            'total_processed': len(images),
            'successful': len([r for r in final_results if r['success']])
        })
        
    except Exception as e:
        return jsonify({'error': f'Erreur lors de l\'analyse: {str(e)}'}), 500

@app.route('/api/ai-indexing/rename', methods=['POST'])
def ai_indexing_rename():
    """Renomme les images selon les suggestions de l'IA"""
    try:
        data = request.get_json()
        
        if not data or 'renames' not in data or 'document_name' not in data:
            return jsonify({'error': 'Données manquantes'}), 400
        
        renames = data['renames']
        document_name = data['document_name']
        document_folder = os.path.join(app.config['OUTPUT_FOLDER'], document_name)
        
        results = []
        
        for rename_data in renames:
            old_filename = rename_data['old_filename']
            new_filename = rename_data['new_filename']
            
            old_path = os.path.join(document_folder, old_filename)
            new_path = os.path.join(document_folder, new_filename)
            
            if not os.path.exists(old_path):
                results.append({
                    'old_filename': old_filename,
                    'new_filename': new_filename,
                    'success': False,
                    'error': 'Fichier source non trouvé'
                })
                continue
            
            if os.path.exists(new_path):
                results.append({
                    'old_filename': old_filename,
                    'new_filename': new_filename,
                    'success': False,
                    'error': 'Le fichier de destination existe déjà'
                })
                continue
            
            try:
                os.rename(old_path, new_path)
                results.append({
                    'old_filename': old_filename,
                    'new_filename': new_filename,
                    'success': True
                })
            except Exception as e:
                results.append({
                    'old_filename': old_filename,
                    'new_filename': new_filename,
                    'success': False,
                    'error': f'Erreur de renommage: {str(e)}'
                })
        
        return jsonify({
            'success': True,
            'results': results,
            'total_processed': len(renames),
            'successful': len([r for r in results if r['success']])
        })
        
    except Exception as e:
        return jsonify({'error': f'Erreur lors du renommage: {str(e)}'}), 500

def generate_new_filename(original_filename, title):
    """
    Génère un nouveau nom de fichier basé sur le titre généré par l'IA
    Remplace la partie 'n_Y' par le titre en 2 mots pour l'affichage
    """
    try:
        # Exemple: CRL-DOC-1 n_5.jpg -> CRL-DOC-1 graphique courbes.jpg
        parts = original_filename.split(' n_')
        if len(parts) == 2:
            prefix = parts[0]  # "CRL-DOC-1"
            extension = parts[1].split('.')[-1]  # "jpg"
            
            # Nettoyer le titre (supprimer caractères spéciaux)
            clean_title = re.sub(r'[^\w\s-]', '', title).strip()
            clean_title = re.sub(r'\s+', ' ', clean_title)  # Normaliser les espaces
            
            return f"{prefix} {clean_title}.{extension}"
        else:
            # Fallback: ajouter le titre avant l'extension
            name, ext = os.path.splitext(original_filename)
            clean_title = re.sub(r'[^\w\s-]', '', title).strip()
            return f"{name} {clean_title}{ext}"
    except:
        # En cas d'erreur, retourner le nom original
        return original_filename

def generate_export_filename(section_nomenclature, image_index, ai_title, extension):
    """
    Génère un nom de fichier pour l'export ZIP selon le format spécifié :
    [PREFIXE-SECTION]-[Y] [nom de l'image].extension
    où Y est le numéro de l'image dans la section
    """
    try:
        # Nettoyer le titre IA (supprimer caractères spéciaux)
        clean_title = re.sub(r'[^\w\s-]', '', ai_title).strip()
        clean_title = re.sub(r'\s+', ' ', clean_title)  # Normaliser les espaces
        
        # Format : PREFIXE-SECTION-[Y] [nom IA].extension
        return f"{section_nomenclature}-{image_index} {clean_title}.{extension}"
    except:
        # Fallback en cas d'erreur
        return f"{section_nomenclature}-{image_index} image.{extension}"

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False) 