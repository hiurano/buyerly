param(
    [Parameter(Mandatory = $true)]
    [string]$ComfyUIRoot
)

$ErrorActionPreference = "Stop"
$bundleRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sourceRoot = Join-Path $bundleRoot "custom_nodes"
$resolvedComfy = (Resolve-Path -LiteralPath $ComfyUIRoot).Path
$customNodes = Join-Path $resolvedComfy "custom_nodes"

if (-not (Test-Path -LiteralPath (Join-Path $resolvedComfy "main.py") -PathType Leaf)) {
    throw "The selected root does not contain ComfyUI main.py."
}
if (-not (Test-Path -LiteralPath $customNodes -PathType Container)) {
    throw "The selected ComfyUI root has no custom_nodes directory."
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "Python is required to verify the release before installation."
}
& $python.Source (Join-Path $bundleRoot "scripts\verify.py")
if ($LASTEXITCODE -ne 0) {
    throw "Release verification failed. Nothing was installed."
}

$packs = @(Get-ChildItem -LiteralPath $sourceRoot -Directory | Sort-Object Name)
if ($packs.Count -ne 10) {
    throw "Expected exactly 10 source packs."
}
foreach ($pack in $packs) {
    $destination = Join-Path $customNodes $pack.Name
    if (Test-Path -LiteralPath $destination) {
        throw "Destination already exists: $destination. Refusing to merge or overwrite."
    }
}

$stage = Join-Path $customNodes (".matrix-wave1-stage-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    foreach ($pack in $packs) {
        Copy-Item -LiteralPath $pack.FullName -Destination (Join-Path $stage $pack.Name) -Recurse
    }
    foreach ($pack in $packs) {
        Move-Item -LiteralPath (Join-Path $stage $pack.Name) -Destination (Join-Path $customNodes $pack.Name)
    }
}
finally {
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}

Write-Output "Installed 10 MATRIX POWER NODES Wave 1 packs. Restart ComfyUI, refresh node definitions, and keep live=false for the installation check."

