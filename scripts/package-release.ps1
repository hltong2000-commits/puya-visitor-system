param(
  [string]$OutputPath = "dist/puya-visitor-system-release.zip"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $root $OutputPath
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("puya-visitor-release-" + [guid]::NewGuid().ToString('N'))

$files = @(
  'server.js', 'db.js', 'package.json', 'package-lock.json', '.env.example',
  'Dockerfile', '.dockerignore', 'README.md'
)
$directories = @('public', 'cloudbase')

try {
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file) }
  foreach ($directory in $directories) { Copy-Item -LiteralPath (Join-Path $root $directory) -Destination (Join-Path $stage $directory) -Recurse }
  $outputDir = Split-Path -Parent $output
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $output -CompressionLevel Optimal
  Write-Output "Release package: $output"
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $stageRoot = [System.IO.Path]::GetFullPath($stage)
  if ($stageRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stageRoot)) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
