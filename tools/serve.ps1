# =====================================================================
#  tools/serve.ps1 — May chu tinh cho SpendWise, KHONG can Node/Python.
#  Chi can PowerShell co san trong Windows.
#
#    powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8000
#
#  Dung TcpListener (khung TCP thuan) nen KHONG can quyen Administrator
#  va khong can cong dong hoan toan nhu HttpListener.
# =====================================================================
param([int]$Port = 8000)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff2' = 'font/woff2'
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host ''
Write-Host '  SpendWise - dang phuc vu thu muc goc' -ForegroundColor Green
Write-Host ('  Thu muc : ' + $root)
Write-Host ('  Dia chi : http://localhost:' + $Port + '/')
Write-Host '  Nhan Ctrl+C de dung' -ForegroundColor DarkGray
Write-Host ''

function Gui([System.Net.Sockets.NetworkStream]$stream, [byte[]]$data, [string]$type, [int]$code) {
  $head = "HTTP/1.1 $code`r`nContent-Type: $type`r`nContent-Length: $($data.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if ($data.Length -gt 0) { $stream.Write($data, 0, $data.Length) }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      # Doc phan yeu cau HTTP (doc toi het dong trong)
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      # Doc het cac header
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      if (-not $requestLine) { continue }

      $parts = $requestLine.Split(' ')
      $urlPath = $parts[1]
      $clean = ($urlPath -split '\?')[0]
      $decoded = [System.Uri]::UnescapeDataString($clean)

      $rel = $decoded.TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

      # Chan truy cap ra ngoai thu muc du an
      if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
        $msg = [System.Text.Encoding]::UTF8.GetBytes('403 - Forbidden')
        Gui $stream $msg 'text/plain; charset=utf-8' 403
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 - Khong tim thay ' + $decoded)
        Gui $stream $msg 'text/plain; charset=utf-8' 404
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $mime = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      Gui $stream $bytes $mime 200
    } catch {
      # Bo qua loi cua tung ket noi
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}