#!/bin/bash
# Script de déploiement rapide pour tests

echo "🚀 TURINGAROU - Déploiement Rapide"
echo "=================================="
echo ""

# Vérifier si on est dans le bon dossier
if [ ! -f "turingarou-connected.html" ]; then
    echo "❌ Erreur : Exécutez ce script depuis le dossier turingarou/"
    exit 1
fi

# Frontend
echo "📦 Frontend - Déploiement sur GitHub..."
read -p "Entrez votre message de commit : " commit_msg
git add turingarou-connected.html README.md DEPLOYMENT.md
git commit -m "$commit_msg"
git push

echo "✅ Frontend poussé sur GitHub"
echo "   Vérifiez GitHub Pages : Settings → Pages"
echo ""

# Backend
echo "🔧 Backend - Déploiement..."
cd turingarou-backend

read -p "Voulez-vous aussi déployer le backend ? (o/n) " deploy_backend

if [ "$deploy_backend" = "o" ] || [ "$deploy_backend" = "O" ]; then
    git add .
    git commit -m "$commit_msg"
    git push
    echo "✅ Backend poussé - Render/Railway va auto-déployer"
else
    echo "⏭️  Backend non déployé"
fi

cd ..

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "📝 Prochaines étapes :"
echo "1. Attendre ~2 min pour le build"
echo "2. Partager l'URL avec vos amis"
echo "3. Jouer ! 🎮"
