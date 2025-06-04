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
            "model": "pixtral-12b-2409",  # Modèle Mistral avec support d'images
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
        total = len(image_paths)
        
        for i, image_path in enumerate(image_paths):
            if progress_callback:
                progress_callback(i + 1, total, os.path.basename(image_path))
            
            result = self.analyze_image(image_path)
            results[image_path] = result
        
        return results


def get_indexer():
    """
    Factory pour obtenir une instance du service d'indexation
    
    Returns:
        AIImageIndexer: Instance du service
    """
    return AIImageIndexer()


def test_api_connection():
    """
    Teste la connexion à l'API Mistral
    
    Returns:
        bool: True si la connexion fonctionne
    """
    indexer = get_indexer()
    if not indexer.is_available():
        return False
    
    # Test simple avec une requête de santé
    headers = {
        "Authorization": f"Bearer {indexer.api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        # Test avec une requête simple
        payload = {
            "model": "pixtral-12b-2409",
            "messages": [{"role": "user", "content": "Test"}],
            "max_tokens": 1
        }
        
        response = requests.post(
            MISTRAL_API_URL,
            headers=headers,
            json=payload,
            timeout=10
        )
        
        return response.status_code in [200, 429]  # 429 = rate limit mais connexion OK
        
    except Exception:
        return False 