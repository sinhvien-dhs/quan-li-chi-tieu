@echo off
chcp 65001 >nul
title SpendWise Local Web Server
echo ========================================================
echo  DANG KHOI DONG SPENDWISE LOCAL WEB SERVER...
echo  (Ho tro day du Dang nhap Google, Firebase va AI)
echo ========================================================
echo.
node tools/serve.js
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the khoi dong bang Node.js!
    echo Thu chay bang Python...
    start http://localhost:8000
    python -m http.server 8000
)
pause
