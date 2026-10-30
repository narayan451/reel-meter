# Builds the Chrome Web Store upload: dist\reel-meter-<version>.zip
# Only the files the extension needs go in (no tests, tools or docs).
# Entry names use "/" - Compress-Archive on Windows PowerShell writes "\",
# which the Web Store does not accept.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist "reel-meter-$version.zip"
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $zip) { Remove-Item -Force $zip }

$files = @()
foreach ($item in @('manifest.json', 'background.js', 'lib', 'content', 'popup', 'icons')) {
    $files += Get-ChildItem -Path (Join-Path $root $item) -File -Recurse
}

$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    foreach ($f in $files) {
        $name = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $name, 'Optimal') | Out-Null
    }
} finally {
    $archive.Dispose()
}
Write-Output "Built $zip ($($files.Count) files)"
