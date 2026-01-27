#!/bin/bash

echo "=========================================="
echo "🚀 DEPLOYING TO RAILWAY"
echo "=========================================="
echo ""
echo "This script pushes the current branch and triggers Railway auto-deploy."
echo ""
echo "=========================================="
echo ""

cd "$(dirname "$0")/../.."

# Check if we can push without auth (unlikely but worth trying)
echo "Attempting automatic push..."
git push origin main 2>&1 | tee /tmp/git_push_output.txt

if grep -q "Everything up-to-date\|already up to date" /tmp/git_push_output.txt; then
    echo ""
    echo "✅ Already deployed!"
    exit 0
fi

if grep -q "Authentication failed\|could not read" /tmp/git_push_output.txt; then
    echo ""
    echo "❌ Authentication required"
    echo ""
    echo "=========================================="
    echo "MANUAL PUSH REQUIRED"
    echo "=========================================="
    echo ""
    echo "Option 1: Use Personal Access Token (Recommended)"
    echo "  1. Get token from: https://github.com/settings/tokens"
    echo "  2. Run this command:"
    echo ""
    echo "     git push https://YOUR_TOKEN@github.com/YOUR_ORG/rumi-platform.git main"
    echo ""
    echo "Option 2: Configure SSH (One-time setup)"
    echo "  1. Generate key: ssh-keygen -t ed25519 -C 'your_email@example.com'"
    echo "  2. Copy public key: cat ~/.ssh/id_ed25519.pub"
    echo "  3. Add to GitHub: https://github.com/settings/keys"
    echo "  4. Change remote: git remote set-url origin git@github.com:YOUR_ORG/rumi-platform.git"
    echo "  5. Push: git push origin main"
    echo ""
    echo "Option 3: Use GitHub Desktop or VS Code Git extension"
    echo ""
    exit 1
fi

# Check if push succeeded
if grep -q "main -> main" /tmp/git_push_output.txt || grep -q "To https://github.com" /tmp/git_push_output.txt; then
    echo ""
    echo "=========================================="
    echo "✅ SUCCESS! CODE PUSHED TO GITHUB"
    echo "=========================================="
    echo ""
    echo "Railway will auto-deploy in 1-2 minutes."
    echo ""
    echo "Monitor deployment:"
    echo "  railway logs --tail 100 --follow"
    echo ""
    echo "Or check Railway dashboard:"
    echo "  https://railway.app"
    echo ""
    exit 0
else
    echo ""
    echo "⚠️ Push status unclear. Check output above."
    echo ""
    exit 1
fi
