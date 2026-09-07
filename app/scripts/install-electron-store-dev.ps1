param(
  [string]$MetadataPath = (Join-Path $PSScriptRoot '..\electron-dist\store\Acedia-Store-Dev.metadata.json')
)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '개발용 MSIX 인증서를 LocalMachine에 신뢰시키려면 관리자 PowerShell에서 실행해야 합니다.'
}

$resolvedMetadataPath = (Resolve-Path -LiteralPath $MetadataPath).Path
$metadata = Get-Content -LiteralPath $resolvedMetadataPath -Raw | ConvertFrom-Json
if (-not $metadata.signedForDevelopment) {
  throw 'Refusing to install an unsigned or production Store package.'
}

$packagePath = Join-Path (Split-Path -Parent $resolvedMetadataPath) $metadata.artifact
if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw "MSIX package not found: $packagePath"
}
$certificatePath = [string]$metadata.publicCertificatePath
if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
  throw "Development public certificate not found: $certificatePath"
}

$trusted = Get-ChildItem -Path 'Cert:\LocalMachine\TrustedPeople' |
  Where-Object { $_.Thumbprint -eq $metadata.certificateThumbprint } |
  Select-Object -First 1
if (-not $trusted) {
  Write-Output '개발 전용 공개 인증서를 LocalMachine TrustedPeople에 등록합니다.'
  Import-Certificate -FilePath $certificatePath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
}

Add-AppxPackage -Path $packagePath -ForceApplicationShutdown
Get-AppxPackage -Name $metadata.identityName |
  Select-Object Name, PackageFullName, Version, InstallLocation
