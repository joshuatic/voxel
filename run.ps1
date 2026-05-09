param(
    [string]$HostAddress = "127.0.0.1",

    # If Port is 0, Voxel randomly picks a free 87xx port.
    [int]$Port = 0,

    [int]$PortMin = 8700,
    [int]$PortMax = 8799,

    [switch]$SetupOnly,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[Voxel] $Message" -ForegroundColor Cyan
}

function Write-Good {
    param([string]$Message)
    Write-Host "[Voxel] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[Voxel] WARNING: $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[Voxel] ERROR: $Message" -ForegroundColor Red
}

function Get-RepoRoot {
    return Split-Path -Parent $MyInvocation.ScriptName
}

function Test-CommandExists {
    param([string]$Command)

    $found = Get-Command $Command -ErrorAction SilentlyContinue
    return $null -ne $found
}

function Get-PythonCommand {
    if (Test-CommandExists "py") {
        return "py"
    }

    if (Test-CommandExists "python") {
        return "python"
    }

    return $null
}

function Invoke-Python {
    param(
        [string]$PythonCommand,
        [string[]]$Arguments
    )

    if ($PythonCommand -eq "py") {
        & py @Arguments
    }
    else {
        & python @Arguments
    }
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        Write-Info "Created folder: $Path"
    }
}

function Ensure-GitKeep {
    param([string]$Path)

    $gitKeepPath = Join-Path $Path ".gitkeep"

    if (-not (Test-Path $gitKeepPath)) {
        New-Item -ItemType File -Force -Path $gitKeepPath | Out-Null
    }
}

function Ensure-Venv {
    param(
        [string]$PythonCommand,
        [string]$RepoRoot
    )

    $venvPath = Join-Path $RepoRoot ".venv"
    $venvPython = Join-Path $venvPath "Scripts\python.exe"

    if (Test-Path $venvPython) {
        Write-Good "Virtual environment found."
        return
    }

    Write-Info "Creating virtual environment..."

    if ($PythonCommand -eq "py") {
        & py -3.12 -m venv $venvPath

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Python 3.12 launcher failed. Trying default Python..."
            & py -m venv $venvPath
        }
    }
    else {
        & python -m venv $venvPath
    }

    if (-not (Test-Path $venvPython)) {
        throw "Failed to create virtual environment."
    }

    Write-Good "Virtual environment created."
}

function Install-Requirements {
    param([string]$RepoRoot)

    $venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    $requirementsPath = Join-Path $RepoRoot "requirements.txt"

    if (-not (Test-Path $requirementsPath)) {
        Write-Warn "requirements.txt not found. Skipping dependency install."
        return
    }

    Write-Info "Upgrading pip..."
    & $venvPython -m pip install --upgrade pip

    Write-Info "Installing requirements..."
    & $venvPython -m pip install -r $requirementsPath

    if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed."
    }

    Write-Good "Requirements installed."
}

function Ensure-ProjectFolders {
    param([string]$RepoRoot)

    $folders = @(
        "data",
        "logs",
        "models",
        "voices",
        "data\tts",
        "data\temp-audio",
        "data\voice-cache"
    )

    foreach ($folder in $folders) {
        $path = Join-Path $RepoRoot $folder
        Ensure-Directory $path
    }

    Ensure-GitKeep (Join-Path $RepoRoot "data")
    Ensure-GitKeep (Join-Path $RepoRoot "logs")
    Ensure-GitKeep (Join-Path $RepoRoot "models")
    Ensure-GitKeep (Join-Path $RepoRoot "voices")

    Write-Good "Project folders ready."
}

function Test-ModelFolder {
    param([string]$RepoRoot)

    $modelsPath = Join-Path $RepoRoot "models"
    $models = Get-ChildItem -Path $modelsPath -Filter "*.gguf" -File -ErrorAction SilentlyContinue

    if (-not $models -or $models.Count -eq 0) {
        Write-Warn "No GGUF models found in models/. Local AI will show as missing until you add one."
        return
    }

    Write-Good "Found $($models.Count) GGUF model(s)."
}

function Test-VoiceFolder {
    param([string]$RepoRoot)

    $voicesPath = Join-Path $RepoRoot "voices"
    $voiceJsonFiles = Get-ChildItem -Path $voicesPath -Filter "voice.json" -Recurse -File -ErrorAction SilentlyContinue

    if (-not $voiceJsonFiles -or $voiceJsonFiles.Count -eq 0) {
        Write-Warn "No voices found in voices/. TTS voice list may be empty."
        return
    }

    Write-Good "Found $($voiceJsonFiles.Count) voice definition(s)."
}

function Test-PortAvailable {
    param(
        [string]$HostAddress,
        [int]$Port
    )

    $listener = $null

    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($HostAddress), $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener -ne $null) {
            $listener.Stop()
        }
    }
}

function Get-RandomVoxelPort {
    param(
        [string]$HostAddress,
        [int]$PortMin,
        [int]$PortMax
    )

    if ($PortMin -lt 1 -or $PortMax -gt 65535 -or $PortMin -gt $PortMax) {
        throw "Invalid port range: $PortMin-$PortMax"
    }

    $candidatePorts = $PortMin..$PortMax | Sort-Object { Get-Random }

    foreach ($candidatePort in $candidatePorts) {
        if (Test-PortAvailable -HostAddress $HostAddress -Port $candidatePort) {
            return $candidatePort
        }
    }

    throw "No free ports found in range $PortMin-$PortMax."
}

function Start-Voxel {
    param(
        [string]$RepoRoot,
        [string]$HostAddress,
        [int]$Port,
        [int]$PortMin,
        [int]$PortMax
    )

    $venvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    $venvScripts = Join-Path $RepoRoot ".venv\Scripts"

    if (-not (Test-Path $venvPython)) {
        throw "Virtual environment Python not found. Run setup first."
    }

    $env:PATH = "$venvScripts;$env:PATH"

    if ($Port -eq 0) {
        $Port = Get-RandomVoxelPort -HostAddress $HostAddress -PortMin $PortMin -PortMax $PortMax
        Write-Info "Randomly selected free Voxel port: $Port"
    }
    else {
        if (-not (Test-PortAvailable -HostAddress $HostAddress -Port $Port)) {
            throw "Port $Port is already in use. Try running without -Port so Voxel can pick a free 87xx port."
        }
    }

    $url = "http://${HostAddress}:${Port}"

    Write-Good "Starting Voxel..."
    Write-Info "Opened on: $url"
    Write-Info "87xx port family: $PortMin-$PortMax"

    $env:VOXEL_HOST = $HostAddress
    $env:VOXEL_PORT = "$Port"
    $env:VOXEL_URL = $url

    & $venvPython -m uvicorn app.main:app `
        --host $HostAddress `
        --port $Port `
        --reload
}

try {
    $repoRoot = Get-RepoRoot
    Set-Location $repoRoot

    Write-Info "Repo root: $repoRoot"

    $pythonCommand = Get-PythonCommand

    if (-not $pythonCommand) {
        throw "Python was not found. Install Python 3.12+ and make sure it is on PATH."
    }

    Write-Good "Python launcher found: $pythonCommand"

    Ensure-Venv -PythonCommand $pythonCommand -RepoRoot $repoRoot
    Ensure-ProjectFolders -RepoRoot $repoRoot

    if (-not $SkipInstall) {
        Install-Requirements -RepoRoot $repoRoot
    }
    else {
        Write-Warn "Skipping dependency install because -SkipInstall was provided."
    }

    Test-ModelFolder -RepoRoot $repoRoot
    Test-VoiceFolder -RepoRoot $repoRoot

    if ($SetupOnly) {
        Write-Good "Setup complete."
        exit 0
    }

    Start-Voxel `
        -RepoRoot $repoRoot `
        -HostAddress $HostAddress `
        -Port $Port `
        -PortMin $PortMin `
        -PortMax $PortMax
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}