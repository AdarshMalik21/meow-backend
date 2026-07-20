# Paste Firebase Admin JSON into Render reliably (base64)
# Run from repo root:
#   powershell -File backend/scripts/prepare-render-firebase.ps1

$ErrorActionPreference = "Stop"
$jsonPath = Join-Path $PSScriptRoot "..\zippycar-b76e2-firebase-adminsdk-fbsvc-d326096f60.json"

if (-not (Test-Path $jsonPath)) {
  Write-Host "Firebase JSON not found at: $jsonPath"
  Write-Host "Update `$jsonPath in this script to your adminsdk file."
  exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($jsonPath)
$b64 = [Convert]::ToBase64String($bytes)
$b64 | Set-Clipboard

Write-Host ""
Write-Host "Done. Base64 copied to clipboard."
Write-Host ""
Write-Host "On Render -> Environment -> add or update:"
Write-Host "  Key:   FIREBASE_SERVICE_ACCOUNT_B64"
Write-Host "  Value: paste from clipboard (one long line)"
Write-Host ""
Write-Host "Optional: remove FIREBASE_SERVICE_ACCOUNT_JSON if you use B64 instead."
Write-Host "Then Manual Deploy on Render."
Write-Host ""
Write-Host "Expected health after deploy:"
Write-Host "  firebaseProject: zippycar-b76e2"
