# DocuLens

**📄 Extract and organize PDF images with smart section detection**

Modern web app that extracts images from PDFs, automatically detects document sections, and lets you organize everything with a sleek drag & drop interface.

## 🌐 Essayer l'App

**👉 [Tester DocuLens en ligne](https://doculens.onrender.com/)**

## 🚀 Installation Locale

```bash
git clone https://github.com/Orsso/DocuLens.git
cd DocuLens
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` → Upload PDF → Edit sections → Export ZIP

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