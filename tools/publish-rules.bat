@echo off
REM ============================================================
REM  Publish Firestore Rules len Firebase
REM  Cach dung: nhan doi vao file nay
REM ============================================================
setlocal
cd /d "%~dp0.."

echo ============================================================
echo   DANG DANG NHAP FIREBASE CLI
echo   Se mo trinh duyet - hay bam "Cho phep" (Allow)
echo ============================================================
echo.

call npx.cmd --yes firebase-tools@13 login
if errorlevel 1 (
  echo.
  echo [LOI] Dang nhap that bai. Hay thu lai.
  goto :het
)

echo.
echo ============================================================
echo   DANG TAI VA TRI KHAI LAI RULES
echo ============================================================
echo.

call npx.cmd --yes firebase-tools@13 deploy --only firestore:rules --project spendwise-364bd
if errorlevel 1 (
  echo.
  echo [LOI] Deploy that bai - xem thong bao loi o tren.
  goto :het
)

echo.
echo ============================================================
echo   THANH CONG! Rules da duoc cap nhat len may chu.
echo ============================================================
goto :het

:het
echo.
echo Nhan phim bat ky de dong cua so nay...
pause > nul
endlocal