# =====================================================================
#  Helper: dang nhap Firebase CLI khong can can vao giay
#  - Chay `firebase login --no-localhost` o che do nen
#  - Ghi URL xac thuc ra file url.txt
#  - Cho doi giay cho file code.txt xuat hien -> dua ma vao may chu
#  - Ghi toan bo ket qua vao login.log
# =====================================================================
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$tmp = $env:TEMP
$urlFile = Join-Path $tmp 'fb-url.txt'
$codeFile = Join-Path $tmp 'fb-code.txt'
$logFile = Join-Path $tmp 'fb-login-helper.log'
foreach ($f in @($urlFile, $codeFile, $logFile)) { Remove-Item $f -ErrorAction SilentlyContinue }

function Ghi($nhan, $duongDan) {
  Add-Content -Path $duongDan -Value $nhan -Encoding UTF8
}

Ghi "=== Bat dau $(Get-Date) ===" $logFile
Ghi "Thu muc: $root" $logFile

$npx = 'C:\Program Files\nodejs\npx.cmd'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $npx
$psi.Arguments = '--yes firebase-tools@13 login --no-localhost'
$psi.WorkingDirectory = $root
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
$p.Start() | Out-Null
Ghi "PID: $($p.Id)" $logFile

# Doc output de lay URL
$url = ''
$deadline = (Get-Date).AddMinutes(8)
$buffer = New-Object System.Text.StringBuilder

$readTask = $p.StandardOutput.ReadToEndAsync()
$readErr = $p.StandardError.ReadToEndAsync()

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  if ($p.HasExited) { break }
}

# Cho toi thay 1 ky tu trong stdin (de khong bi loi EOF ngay)
# -> thuc te ta can gui ma, nen dung vong lap cho
Ghi "Dang cho nguoi dung mo URL va xac nhan..." $logFile

# Vong lap: doc file code.txt roi gui vao stdin
$gui = $false
$deadline2 = (Get-Date).AddMinutes(8)
while ((Get-Date) -lt $deadline2) {
  Start-Sleep -Seconds 3
  if (Test-Path $codeFile) {
    $code = (Get-Content $codeFile -Raw).Trim()
    if ($code) {
      $p.StandardInput.WriteLine($code)
      $p.StandardInput.Flush()
      Ghi "Da gui ma xac nhan" $logFile
      $gui = $true
      Remove-Item $codeFile -ErrorAction SilentlyContinue
      break
    }
  }
  if ($p.HasExited) { break }
}

if (-not $p.HasExited) {
  $p.StandardInput.Close()
}
$p.WaitForExit(60000) | Out-Null

$out = $p.StandardOutput.ReadToEnd()
$err = $p.StandardError.ReadToEnd()
Ghi "--- STDOUT ---" $logFile
Ghi $out $logFile
Ghi "--- STDERR ---" $logFile
Ghi $err $logFile
Ghi "Exit code: $($p.ExitCode)" $logFile
Ghi "=== Ket thuc $(Get-Date) ===" $logFile

# Luu URL ra file de dung cho buoc xac nhan
if ($out -match 'https://[^\s]+') { Set-Content -Path $urlFile -Value $Matches[0] -Encoding UTF8 }
Ghi "DA LUU URL VAO $urlFile" $logFile