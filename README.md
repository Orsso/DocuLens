# DocuLens

## Extract and organize PDF images with smart section detection

Modern web app that extracts images from PDFs, automatically detects document sections, and lets you organize everything with a sleek drag & drop interface.

## 🌐 Test Online

**👉 [DocuLens](https://doculens.onrender.com/)**

## 🚀 Local installation

```bash
git clone https://github.com/Orsso/DocuLens.git
cd DocuLens
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

**Optional - AI Auto-indexing:**
```bash
# Copy environment template
cp .env.example .env
# Add your Mistral API key to .env file
echo "MISTRAL_API_KEY=your_api_key_here" >> .env
```

Open `http://localhost:5000` → Upload PDF → Edit sections → Export ZIP

## What it does

- **🔍 Smart extraction**: Finds images and sections automatically
- **🎨 Intuitive interface**: Drag & drop section organization with visual editing tools
- **🖊️ Image annotations**: Built-in image editor with drawing tools and annotations (beta)
- **📝 Custom naming**: Personalize section nomenclature
- **🤖 AI-powered Auto-indexing**: Intelligent auto-tagging and indexing of images (beta)
- **📦 Clean export**: Organized ZIP with custom filenames

## Tech Stack

**Backend**: Flask + PyMuPDF + Mistral AI  
**Frontend**: Bootstrap + SortableJS + Modern CSS

## 📁 Core Files

```
DocuLens/
├── app.py              # Main Flask app
├── templates/          # HTML templates  
├── uploads/            # PDF input
└── extracted_images/   # Temp output
```

## 🗺️ Roadmap

Here's a brief overview of planned features and improvements:

*   **Refine the editor**: The current image editor is in beta and will be further polished for stability and features.
*   **Image Import**: Allow users to import existing image files directly into the application.
*   **Image Merge Function**: Implement a feature to merge multiple selected images into a single image.
*   **Project Save/Load**: Enable users to save their current work (extracted images, section structure, annotations) as a project file and load it back later.
*   **Zoom Management in Section Arranger**: Add zoom controls (zoom in, zoom out, fit to screen) to the section arrangement view for better navigation with a large number of images.
*   **AI-powered Auto-indexing**: Implement intelligent auto-tagging and indexing of images based on their content.

## ⚠️ Known Issues

*   **Tool selection in editor:** The selection of drawing tools in the image editor can sometimes be unstable.
*   **Invisible annotations:** Annotations on images may occasionally appear invisible or not render as expected.
*   **AI-powered Auto-indexing:** The AI-powered auto-indexing is in beta and may not always work as expected.


## 🤝 Contributing

PRs welcome. Keep it simple.

## 📄 License

MIT 