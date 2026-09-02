param(
  [string]$MetadataPath = (Join-Path $PSScriptRoot '..\electron-dist\store\MultiAgent-Store-Dev.metadata.json')
)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Windows App Certification Kit은 관리자 PowerShell에서 실행해야 합니다.'
}

$appCert = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
if (-not (Test-Path -LiteralPath $appCert -PathType Leaf)) {
  throw 'Windows App Certification Kit is not installed.'
}

$resolvedMetadataPath = (Resolve-Path -LiteralPath $MetadataPath).Path
$metadata = Get-Content -LiteralPath $resolvedMetadataPath -Raw | ConvertFrom-Json
$packagePath = Join-Path (Split-Path -Parent $resolvedMetadataPath) $metadata.artifact
$reportPath = Join-Path (Split-Path -Parent $resolvedMetadataPath) 'wack-report.xml'

& $appCert reset
if ($LASTEXITCODE -ne 0) { throw "appcert reset failed: $LASTEXITCODE" }
& $appCert test -appxpackagepath $packagePath -reportoutputpath $reportPath
if ($LASTEXITCODE -ne 0) { throw "Windows App Certification Kit failed: $LASTEXITCODE" }
Write-Output "WACK_REPORT=$reportPath"
