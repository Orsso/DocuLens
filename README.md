# DocuLens

**📄 Extract and organize PDF images with smart section detection**

Modern web app that extracts images from PDFs, automatically detects document sections, and lets you organize everything with a sleek drag & drop interface.

## 🚀 Quick Start

```bash
git clone https://github.com/Orsso/DocuLens.git
cd DocuLens
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` → Upload PDF → Edit sections → Export ZIP

## 🌐 Deploy for Free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Orsso/DocuLens)

1. Click the button above or go to [render.com](https://render.com)
2. Connect your GitHub account  
3. Select this repository
4. Deploy automatically (takes ~2 min)
5. Get your live URL: `https://yourapp.onrender.com`

## ✨ What it does

- **🔍 Smart extraction**: Finds images and sections automatically
- **🎨 Visual editor**: Drag & drop interface with 3-level hierarchy  
- **📝 Custom naming**: Personalize section nomenclature
- **📦 Clean export**: Organized ZIP with custom filenames

## 🛠️ Tech Stack

**Backend**: Flask + PyMuPDF  
**Frontend**: Bootstrap + SortableJS + Modern CSS

## 📁 Core Files

```
DocuLens/
├── app.py              # Main Flask app
├── templates/          # HTML templates  
├── uploads/            # PDF input
└── extracted_images/   # Temp output
```

## 🤝 Contributing

PRs welcome. Keep it simple.

## 📄 License

MIT 