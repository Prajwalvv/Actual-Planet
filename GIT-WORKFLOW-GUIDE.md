# Git Workflow Guide - Actual Planet

## ✅ Current Setup

**Repository:** https://github.com/Prajwalvv/Actual-Planet  
**Your Email:** iamvv2024@gmail.com  
**Your Name:** Prajwalvv  
**License:** GNU Affero General Public License v3.0

---

## 📋 Branch Management

### Create a New Branch
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or create branch for bug fixes
git checkout -b fix/bug-description

# Or for experiments
git checkout -b experiment/neural-ant-v2
```

### Switch Between Branches
```bash
# Switch to an existing branch
git checkout main
git checkout feature/your-feature-name

# List all branches
git branch
git branch -a  # includes remote branches
```

### Push Branch to GitHub
```bash
# Push new branch to GitHub
git push -u origin feature/your-feature-name

# After first push, just use
git push
```

### Merge Branch into Main
```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge your feature branch
git merge feature/your-feature-name

# Push to GitHub
git push origin main
```

### Delete a Branch
```bash
# Delete local branch (after merging)
git branch -d feature/your-feature-name

# Force delete (if not merged)
git branch -D feature/your-feature-name

# Delete remote branch
git push origin --delete feature/your-feature-name
```

---

## 🔄 Daily Workflow

### Starting Work
```bash
# Make sure you're on the right branch
git checkout main
git pull origin main

# Create new branch for your work
git checkout -b feature/new-feature
```

### Making Changes
```bash
# Check what files changed
git status

# Add specific files
git add path/to/file.ts

# Or add all changes
git add .

# Commit with descriptive message
git commit -m "Add neural ant pheromone optimization"

# Push to GitHub
git push
```

### Saving Work in Progress
```bash
# Stash changes temporarily
git stash

# Switch branches
git checkout other-branch

# Come back and restore changes
git checkout feature/new-feature
git stash pop
```

---

## 🛡️ Security Reminders

### Files That Are Protected (in .gitignore)
- ✅ `.env` files
- ✅ `*firebase-adminsdk*.json` (service account keys)
- ✅ `node_modules/`
- ✅ `__pycache__/`
- ✅ `.DS_Store`

### Before Every Commit
```bash
# Check what will be committed
git status

# Make sure no sensitive files are staged
git diff --cached

# If you accidentally added a sensitive file
git reset path/to/sensitive/file
```

---

## 🔧 Useful Commands

### Undo Last Commit (Keep Changes)
```bash
git reset --soft HEAD~1
```

### Undo Last Commit (Discard Changes)
```bash
git reset --hard HEAD~1
```

### View Commit History
```bash
git log
git log --oneline
git log --graph --oneline --all
```

### See What Changed
```bash
git diff                    # unstaged changes
git diff --staged           # staged changes
git diff main feature/xyz   # compare branches
```

### Update from Main While on Feature Branch
```bash
git checkout feature/your-branch
git rebase main
# Or
git merge main
```

---

## 🌿 Branch Naming Conventions

- `feature/` - New features (e.g., `feature/neural-ant-learning`)
- `fix/` - Bug fixes (e.g., `fix/pheromone-decay-bug`)
- `experiment/` - Experimental work (e.g., `experiment/gru-optimization`)
- `docs/` - Documentation updates (e.g., `docs/api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/agent-architecture`)

---

## 🚀 Quick Reference

```bash
# Clone repo (if starting fresh elsewhere)
git clone https://github.com/Prajwalvv/Actual-Planet.git

# Check current branch
git branch

# Create branch
git checkout -b branch-name

# Stage changes
git add .

# Commit
git commit -m "message"

# Push
git push

# Pull latest
git pull

# Switch branch
git checkout branch-name

# Merge branch
git merge branch-name

# Delete branch
git branch -d branch-name
```

---

## 📧 Email Verification

Your commits will show:
- **Author:** Prajwalvv <iamvv2024@gmail.com>

This is configured **only for this repository**. Other repos will use their own settings.

---

## 🔗 GitHub Repository

View your code at: https://github.com/Prajwalvv/Actual-Planet

All commits from this folder will appear under your personal account!
