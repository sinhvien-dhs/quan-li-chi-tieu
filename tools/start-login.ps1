# Chay nen: firebase login (che do localhost).
# Ghi toan bo output vao %TEMP%\fb-login.log de doc duoc URL xac nhan.
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $env:TEMP 'fb-login.log'
$err = Join-Path $env:TEMP 'fb-login.err'
Remove-Item $log, $err -ErrorAction SilentlyContinue

$p = Start-Process -FilePath 'C:\Program Files\nodejs\npx.cmd' `
  -ArgumentList '--yes','firebase-tools@13','login' `
  -WorkingDirectory $root `
  -RedirectStandardOutput $log `
  -RedirectStandardError $err `
  -NoNewWindow -PassThru

"PID=$($p.Id)" | Set-Content -Path (Join-Path $env:TEMP 'fb-login.pid')
Start-Sleep -Seconds 3
"Da khoi chay firebase login (PID $($p.Id))"