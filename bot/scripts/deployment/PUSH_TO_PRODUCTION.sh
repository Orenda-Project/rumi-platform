#!/bin/bash

echo "=========================================="
echo "PUSHING REGISTRATION FIX TO PRODUCTION"
echo "=========================================="
echo ""
echo "Commit: df7efd9"
echo "Fix: Allow registration retry for users stuck in flow_sent state"
echo ""
echo "Changes:"
echo "  ✅ Fixed /register command for stuck users"
echo "  ✅ Cached video media ID (faster sends)"
echo "  ✅ Manual registration sent to +92 302 5112114"
echo ""
echo "=========================================="
echo ""

cd "/Users/haroonyasin/Documents/Projects/Rumi/02_Main Rumi Bot"

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
