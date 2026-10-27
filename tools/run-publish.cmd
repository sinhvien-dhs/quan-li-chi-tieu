@echo off
REM Chay tu thu muc tools\, duong dan co dau cach nen dung %~dp0
cd /d "%~dp0.."
echo Thu muc hien tai: %CD%
echo.
echo === BUOC 1: DANG DANG NHAP FIREBASE CLI ===
echo   Trinh duyet se tu mo - hay bam "Cho phep" (Allow)
echo.
call npx.cmd --yes firebase-tools@13 login
if errorlevel 1 goto :fail

echo.
echo === BUOC 2: DEPLOY RULES LEN FIREBASE ===
echo.
call npx.cmd --yes firebase-tools@13 deploy --only firestore:rules --project spendwise-364bd
if errorlevel 1 goto :fail

echo.
echo === DEPLOY THANH CONG! ===
goto :done

:fail
echo.
echo === DEPLOY THAT BAI - xem loi ben tren ===

:done
echo.
echo === HET - dong cua so nay ===