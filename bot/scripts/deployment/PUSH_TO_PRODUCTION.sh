#!/bin/bash

echo "=========================================="
echo "PUSHING TO PRODUCTION"
echo "=========================================="
echo ""
echo "Example deployment push script"
echo "Modify this for your deployment workflow"
echo ""
echo "This script pushes the current branch to GitHub."
echo "Railway will auto-deploy after push."
echo ""
echo "=========================================="
echo ""

cd "$(dirname "$0")/../.."

echo "Current status:"
git status
echo ""

echo "Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ SUCCESS! Code pushed to GitHub"
    echo "=========================================="
    echo ""
    echo "Railway will auto-deploy in 1-2 minutes."
    echo ""
    echo "Monitor deployment:"
    echo "  railway logs --tail 100 --follow"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "❌ PUSH FAILED"
    echo "=========================================="
    echo ""
    echo "You may need to authenticate with GitHub."
    echo ""
    echo "Option 1: Use GitHub Personal Access Token"
    echo "  git push https://YOUR_TOKEN@github.com/your-org/whatsapp-ai-bot.git main"
    echo ""
    echo "Option 2: Configure SSH key"
    echo "  ssh-keygen -t ed25519 -C 'your_email@example.com'"
    echo "  cat ~/.ssh/id_ed25519.pub"
    echo "  # Add to GitHub: https://github.com/settings/keys"
    echo ""
fi
