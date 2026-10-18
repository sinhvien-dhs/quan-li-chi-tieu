@echo off
REM ==============================================================
REM  Mo SpendWise - KHONG can Node.js, KHONG can Python
REM  Chi can Windows (PowerShell co san trong moi may).
REM
REM   Neu may chu dang chay san -> dung no
REM   Neu chua co -> tu bat may chu PowerShell roi mo trinh duyet
REM ==============================================================
cd /d "%~dp0"
set PORT=8000

netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo   Server da chay san tren cong %PORT% - dang mo...
  start "" "http://localhost:%PORT%/"
  exit /b 0
)

echo.
echo   Dang bat may chu SpendWise bang PowerShell (khong can Node)...

start "SpendWise Server" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT%

REM Cho may chu kip khoi dong (ping de tranh loi khi co chuyen huong dau vao)
ping -n 5 127.0.0.1 >nul
start "" "http://localhost:%PORT%/"

echo.
echo   Da mo xong!
echo   Cua so "SpendWise Server" phai giu chay. Dong cua so do de tat may chu.
echo.
exit /b 0