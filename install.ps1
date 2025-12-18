# Vex Package Manager Installation Script for Windows
# Usage: irm https://raw.githubusercontent.com/michailElsikora/vex-pm/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$Repo = "michailElsikora/vex-pm"
$InstallDir = if ($env:VEX_INSTALL) { $env:VEX_INSTALL } else { "$env:USERPROFILE\.vex" }
$BinDir = "$InstallDir\bin"

function Get-LatestVersion {
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
        return $release.tag_name
    } catch {
        return $null
    }
}

function Install-Vex {
    $Version = Get-LatestVersion
    
    if (-not $Version) {
        Write-Host "Could not determine latest version. Installing from source..."
        Install-FromSource
        return
    }
    
    $Platform = "win-x64"
    $DownloadUrl = "https://github.com/$Repo/releases/download/$Version/vex-$Platform.exe"
    
    Write-Host "Installing vex $Version for Windows..."
    
    # Create directories
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    
    # Download binary
    $VexPath = "$BinDir\vex.exe"
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $VexPath
    
    Write-Host ""
    Write-Host "vex installed successfully to $VexPath"
    Write-Host ""
    Write-Host "Add to your PATH:"
    Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
    Write-Host ""
    Write-Host "Then restart your terminal."
    
    # Optionally add to PATH
    $CurrentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($CurrentPath -notlike "*$BinDir*") {
        $AddToPath = Read-Host "Add vex to PATH? (Y/n)"
        if ($AddToPath -ne 'n') {
            [Environment]::SetEnvironmentVariable('Path', "$CurrentPath;$BinDir", 'User')
            $env:Path = "$env:Path;$BinDir"
            Write-Host "Added to PATH. You may need to restart your terminal."
        }
    }
}

function Install-FromSource {
    Write-Host "Installing vex from source..."
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Node.js is required to build from source"
        exit 1
    }
    
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "Error: git is required to build from source"
        exit 1
    }
    
    $TempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
    Set-Location $TempDir
    
    git clone --depth 1 "https://github.com/$Repo.git" vex
    Set-Location vex
    
    npm install
    npm run build
    
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    Copy-Item -Recurse dist "$InstallDir\"
    Copy-Item -Recurse node_modules "$InstallDir\"
    Copy-Item package.json "$InstallDir\"
    
    # Create wrapper script
    $WrapperContent = @"
@echo off
node "%USERPROFILE%\.vex\dist\bin.js" %*
"@
    Set-Content -Path "$BinDir\vex.cmd" -Value $WrapperContent
    
    # Cleanup
    Set-Location $env:USERPROFILE
    Remove-Item -Recurse -Force $TempDir
    
    Write-Host ""
    Write-Host "vex installed successfully to $BinDir\vex.cmd"
    Write-Host ""
    Write-Host "Add to your PATH:"
    Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
}

Install-Vex

