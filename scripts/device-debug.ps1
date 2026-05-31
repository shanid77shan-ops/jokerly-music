# Run Jokerly Music for phone/TWA debugging on the same Wi‑Fi.
# Usage: .\scripts\device-debug.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$ip = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress
)
if (-not $ip) { $ip = "YOUR_PC_IP" }

Write-Host ""
Write-Host "=== Jokerly device debug ===" -ForegroundColor Cyan
Write-Host "PC LAN IP: $ip"
Write-Host "Dev URL:   https://${ip}:3000  (accept self-signed cert on phone)"
Write-Host "Prod URL:  https://music.devshanidp.xyz  (TWA / full Spotify auth)"
Write-Host ""

$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
  Write-Host "ADB devices:" -ForegroundColor Yellow
  & adb devices
  Write-Host ""
  Write-Host "USB WebView inspect: chrome://inspect (enable USB debugging on phone)"
  Write-Host "Install debug APK:   pnpm run android:install-debug"
  Write-Host "Logcat:              pnpm run android:logcat"
} else {
  Write-Host "adb not in PATH — install Android platform-tools for TWA debugging." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Starting Next.js (HTTPS, all interfaces)..." -ForegroundColor Green
pnpm run dev:device
