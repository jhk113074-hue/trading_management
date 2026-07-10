@echo off
echo ===================================================
echo  YSACC TMS Auto Builder, Deployer ^& Git Sync
echo ===================================================

echo [1/3] Building frontend app...
cd app
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    exit /b %errorlevel%
)
cd ..

echo [2/3] Deploying to Firebase Hosting...
call npx firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo [ERROR] Firebase deployment failed!
    exit /b %errorlevel%
)

echo [3/3] Git Committing ^& Pushing to GitHub...
git add .
git commit -m "auto: build, deploy and sync to github"
git push origin main
if %errorlevel% neq 0 (
    echo [WARNING] Git push failed. Please check network/auth.
)

echo ===================================================
echo  Auto Deploy ^& Git Sync Completed Successfully!
echo ===================================================
