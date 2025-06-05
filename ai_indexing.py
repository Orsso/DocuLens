import os
import base64
import requests
import json
import logging
from PIL import Image
from io import BytesIO

# Configuration pour l'API Mistral
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

# Configuration des logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIImageIndexer:
    """
    Service d'indexation d'images via l'API Mistral AI
    """
    
    def __init__(self, api_key=None):
        """
        Initialise le service d'indexation IA
        
        Args:
            api_key (str): Clé API Mistral (optionnelle, peut être définie via variable d'environnement)
        """
        self.api_key = api_key or os.getenv('MISTRAL_API_KEY')
        if not self.api_key:
            logger.warning("⚠️ Clé API Mistral non configurée. L'auto-indexation IA ne sera pas disponible.")
    
    def is_available(self):
        """Vérifie si le service d'indexation IA est disponible"""
        return self.api_key is not None
    
    def _prepare_image(self, image_path, max_size=(1024, 1024)):
        """
        Prépare l'image pour l'envoi à l'API (compression si nécessaire)
        
        Args:
            image_path (str): Chemin vers l'image
            max_size (tuple): Taille maximale (largeur, hauteur)
            
        Returns:
            str: Image encodée en base64
        """
        try:
            with Image.open(image_path) as img:
                # Convertir en RGB si nécessaire
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Redimensionner si l'image est trop grande
                if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)
                
                # Convertir en bytes
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                image_bytes = buffer.getvalue()
                
                # Encoder en base64
                return base64.b64encode(image_bytes).decode('utf-8')
        
        except Exception as e:
            logger.error(f"❌ Erreur lors de la préparation de l'image {image_path}: {e}")
            return None
    
    def _create_system_prompt(self):
        """
        Crée le prompt système pour l'analyse d'images
        
        Returns:
            str: Prompt système optimisé
        """
        return """Tu es un expert en analyse d'images techniques et de documents. 
Analyse l'image et retourne exactement ces informations au format JSON :

1. Un titre descriptif de maximum 2 mots en français
2. Trois tags descriptifs au format #tag

RÉPONSE OBLIGATOIRE (format JSON brut, sans markdown) :
{"title": "deux mots", "tags": ["#tag1", "#tag2", "#tag3"]}

Exemples de réponses attendues :
{"title": "graphique courbes", "tags": ["#graphique", "#données", "#analyse"]}
{"title": "tableau données", "tags": ["#tableau", "#statistiques", "#chiffres"]}
{"title": "schéma technique", "tags": ["#schéma", "#technique", "#diagramme"]}

IMPÉRATIF : Retourne seulement le JSON brut, sans aucune balise markdown, sans texte explicatif, sans ```json."""
    
    def analyze_image(self, image_path):
        """
        Analyse une image via l'API Mistral pour obtenir un titre et des tags
        
        Args:
            image_path (str): Chemin vers l'image à analyser
            
        Returns:
            dict: Dictionnaire contenant 'title' et 'tags' ou None en cas d'erreur
        """
        if not self.is_available():
            logger.error("❌ Service d'indexation IA non disponible (clé API manquante)")
            return None
        
        # Préparer l'image
        image_base64 = self._prepare_image(image_path)
        if not image_base64:
            return None
        
        # Préparer la requête
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "mistral-small-latest",  # Modèle Mistral avec support d'images
            "messages": [
                {
                    "role": "system",
                    "content": self._create_system_prompt()
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Analyse cette image et fournis le titre et les tags au format JSON spécifié."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 150,
            "temperature": 0.1,  # Faible pour des résultats consistants
            "response_format": {
                "type": "json_object"
            }
        }
        
        try:
            logger.info(f"🔍 Analyse de l'image {os.path.basename(image_path)} via Mistral AI...")
            
            response = requests.post(
                MISTRAL_API_URL,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content'].strip()
                
                # Avec response_format: json_object, la réponse devrait être du JSON propre
                try:
                    analysis = json.loads(content)
                    
                    # Validation du format
                    if 'title' in analysis and 'tags' in analysis:
                        # Nettoyer et valider le titre (max 2 mots)
                        title_words = analysis['title'].split()[:2]
                        clean_title = ' '.join(title_words)
                        
                        # Nettoyer et valider les tags (s'assurer qu'ils commencent par #)
                        clean_tags = []
                        for tag in analysis['tags'][:3]:  # Max 3 tags
                            if not tag.startswith('#'):
                                tag = f"#{tag}"
                            clean_tags.append(tag.lower())
                        
                        logger.info(f"✅ Analyse réussie: '{clean_title}' avec tags {clean_tags}")
                        
                        return {
                            'title': clean_title,
                            'tags': clean_tags
                        }
                    else:
                        logger.error("❌ Format de réponse invalide de l'API")
                        return None
                        
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Erreur de parsing JSON: {e}")
                    logger.error(f"Contenu reçu: {content}")
                    
                    # Tentative de récupération : nettoyage des balises markdown au cas où
                    clean_content = content.strip()
                    if clean_content.startswith('```json'):
                        clean_content = clean_content[7:]
                    if clean_content.startswith('```'):
                        clean_content = clean_content[3:]
                    if clean_content.endswith('```'):
                        clean_content = clean_content[:-3]
                    clean_content = clean_content.strip()
                    
                    try:
                        analysis = json.loads(clean_content)
                        if 'title' in analysis and 'tags' in analysis:
                            logger.info(f"✅ JSON récupéré après nettoyage: {analysis}")
                            
                            title_words = analysis['title'].split()[:2]
                            clean_title = ' '.join(title_words)
                            
                            clean_tags = []
                            for tag in analysis['tags'][:3]:
                                if not tag.startswith('#'):
                                    tag = f"#{tag}"
                                clean_tags.append(tag.lower())
                            
                            return {
                                'title': clean_title,
                                'tags': clean_tags
                            }
                    except json.JSONDecodeError:
                        logger.error("❌ Impossible de parser le JSON même après nettoyage")
                    
                    return None
                    
            else:
                logger.error(f"❌ Erreur API Mistral: {response.status_code} - {response.text}")
                return None
                
        except requests.exceptions.Timeout:
            logger.error("❌ Timeout lors de la requête vers l'API Mistral")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Erreur de connexion à l'API Mistral: {e}")
            return None
        except Exception as e:
            logger.error(f"❌ Erreur inattendue lors de l'analyse: {e}")
            return None
    
    def batch_analyze_images(self, image_paths, progress_callback=None):
        """
        Analyse plusieurs images en lot
        
        Args:
            image_paths (list): Liste des chemins d'images à analyser
            progress_callback (callable): Fonction de callback pour le progrès (optionnelle)
            
        Returns:
            dict: Dictionnaire {chemin_image: résultat_analyse}
        """
        results = {}
        
        for i, image_path in enumerate(image_paths):
            if progress_callback:
                progress_callback(i, len(image_paths))
            
            result = self.analyze_image(image_path)
            results[image_path] = result
        
        if progress_callback:
            progress_callback(len(image_paths), len(image_paths))
            
        return results


def get_indexer():
    """
    Retourne une instance du service d'indexation IA
    """
    return AIImageIndexer()

def test_api_connection():
    """
    Teste la connexion à l'API Mistral
    """
    indexer = AIImageIndexer()
    if not indexer.is_available():
        return False
    
    # Test basique : créer une requête simple
    try:
        # Test avec une image 1x1 pixel pour vérifier la connectivité
        import requests
        
        headers = {
            "Authorization": f"Bearer {indexer.api_key}",
            "Content-Type": "application/json"
        }
        
        # Requête de test minimaliste
        test_payload = {
            "model": "mistral-small-latest",
            "messages": [{"role": "user", "content": "Test de connexion."}],
            "max_tokens": 10
        }
        
        response = requests.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers=headers,
            json=test_payload,
            timeout=10
        )
        
        return response.status_code == 200
        
    except Exception as e:
        logger.error(f"Test de connexion échoué: {e}")
        return False

def ensure_unique_titles_global(analysis_results, document_name):
    """
    S'assure que tous les titres générés par l'IA sont uniques en vérifiant 
    GLOBALEMENT toutes les images déjà indexées, pas seulement le batch actuel.
    
    Args:
        analysis_results (list): Liste de dictionnaires avec 'filename', 'title', 'tags'
        document_name (str): Nom du document pour vérifier les titres existants
        
    Returns:
        list: Liste avec les titres rendus uniques
    """
    if not analysis_results:
        return analysis_results
    
    # Récupérer tous les noms IA déjà utilisés dans ce document
    existing_ai_names = get_existing_ai_names(document_name)
    logger.info(f"🔍 Noms IA existants trouvés: {existing_ai_names}")
    
    title_counts = {}
    
    # Initialiser les compteurs avec les noms existants
    for existing_name in existing_ai_names:
        # Extraire le nom de base (sans numéro de fin)
        base_name = existing_name
        number_suffix = 1
        
        # Si le nom se termine par " X" où X est un nombre
        import re
        match = re.match(r'^(.+)\s(\d+)$', existing_name)
        if match:
            base_name = match.group(1)
            number_suffix = int(match.group(2))
        
        # Mettre à jour le compteur pour ce nom de base
        if base_name not in title_counts:
            title_counts[base_name] = number_suffix
        else:
            title_counts[base_name] = max(title_counts[base_name], number_suffix)
    
    unique_results = []
    
    for result in analysis_results:
        if not result or 'title' not in result:
            unique_results.append(result)
            continue
            
        original_title = result['title'].strip()
        
        # Compter les occurrences du titre avec vérification globale
        if original_title in title_counts:
            title_counts[original_title] += 1
            # Ajouter le numéro séquentiel à partir de la 2ème occurrence
            unique_title = f"{original_title} {title_counts[original_title]}"
        else:
            title_counts[original_title] = 1
            unique_title = original_title
        
        # Créer un nouveau résultat avec le titre unique
        unique_result = result.copy()
        unique_result['title'] = unique_title
        unique_results.append(unique_result)
        
        logger.info(f"📝 Titre assigné: '{original_title}' -> '{unique_title}' (occurrence #{title_counts[original_title]})")
    
    logger.info(f"✅ {len(unique_results)} titres rendus uniques ({len(title_counts)} titres originaux)")
    return unique_results

def get_existing_ai_names(document_name):
    """
    Récupère tous les noms IA existants pour un document donné.
    
    IMPORTANT : Dans l'architecture v3.0, les métadonnées IA sont stockées côté client
    dans window.appState, pas dans un fichier serveur. Cette fonction retourne donc
    une liste vide et la vérification des doublons se fait côté client.
    
    Args:
        document_name (str): Nom du document
        
    Returns:
        list: Liste vide (vérification côté client)
    """
    # Dans l'architecture v3.0, les métadonnées IA sont volatiles et stockées
    # uniquement côté client. La vérification des doublons doit se faire
    # côté client lors de l'application des suggestions.
    logger.info(f"🔍 Architecture v3.0: Vérification doublons IA côté client pour {document_name}")
    return []

def ensure_unique_titles(analysis_results):
    """
    ANCIENNE VERSION - Conservée pour compatibilité descendante
    S'assure que tous les titres générés par l'IA sont uniques en ajoutant des numéros séquentiels.
    
    Args:
        analysis_results (list): Liste de dictionnaires avec 'filename', 'title', 'tags'
        
    Returns:
        list: Liste avec les titres rendus uniques
    """
    if not analysis_results:
        return analysis_results
    
    title_counts = {}
    unique_results = []
    
    for result in analysis_results:
        if not result or 'title' not in result:
            unique_results.append(result)
            continue
            
        original_title = result['title'].strip()
        
        # Compter les occurrences du titre
        if original_title in title_counts:
            title_counts[original_title] += 1
            # Ajouter le numéro séquentiel à partir de la 2ème occurrence
            unique_title = f"{original_title} {title_counts[original_title]}"
        else:
            title_counts[original_title] = 1
            unique_title = original_title
        
        # Créer un nouveau résultat avec le titre unique
        unique_result = result.copy()
        unique_result['title'] = unique_title
        unique_results.append(unique_result)
        
        logger.info(f"📝 Titre assigné: '{original_title}' -> '{unique_title}' (occurrence #{title_counts[original_title]})")
    
    logger.info(f"✅ {len(unique_results)} titres rendus uniques ({len(title_counts)} titres originaux)")
    return unique_results 