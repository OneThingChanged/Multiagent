param(
  [Parameter(Mandatory = $true)]
  [string]$Publisher,

  [Parameter(Mandatory = $true)]
  [string]$StateDirectory
)

$ErrorActionPreference = 'Stop'

$resolvedStateDirectory = [System.IO.Path]::GetFullPath($StateDirectory)
$localAppData = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath('LocalApplicationData')).TrimEnd('\')
if (-not $resolvedStateDirectory.StartsWith($localAppData + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Store development certificate state must stay under LocalAppData: $resolvedStateDirectory"
}

$friendlyName = 'MultiAgent Store Development'
$certificate = Get-ChildItem -Path 'Cert:\CurrentUser\My' |
  Where-Object {
    $_.Subject -eq $Publisher -and
    $_.FriendlyName -eq $friendlyName -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date).AddDays(30)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $Publisher `
    -FriendlyName $friendlyName `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature `
    -NotAfter (Get-Date).AddYears(3) `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
}

New-Item -ItemType Directory -Path $resolvedStateDirectory -Force | Out-Null
$certificatePath = Join-Path $resolvedStateDirectory 'MultiAgent-Store-Development.cer'
Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null

[pscustomobject]@{
  thumbprint = $certificate.Thumbprint
  subject = $certificate.Subject
  certificatePath = $certificatePath
  notAfter = $certificate.NotAfter.ToUniversalTime().ToString('o')
} | ConvertTo-Json -Compress
