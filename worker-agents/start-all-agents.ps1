# Start All Worker Agents
# This script starts all 5 worker agents in separate PowerShell windows

Write-Host "Starting all Worker Agents..." -ForegroundColor Green
Write-Host ""

# Get the base directory
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Agent configurations
$agents = @(
    @{Name="Markup Agent"; Port=3801; Dir="$baseDir\markup-agent"},
    @{Name="Style Agent"; Port=3802; Dir="$baseDir\style-agent"},
    @{Name="Script Agent"; Port=3803; Dir="$baseDir\script-agent"},
    @{Name="Python Agent"; Port=3804; Dir="$baseDir\python-agent"},
    @{Name="System Agent"; Port=3805; Dir="$baseDir\system-agent"}
)

# Start each agent
foreach ($agent in $agents) {
    Write-Host "Starting $($agent.Name) on port $($agent.Port)..." -ForegroundColor Cyan
    
    # Check if node_modules exists
    if (-not (Test-Path "$($agent.Dir)\node_modules")) {
        Write-Host "  Installing dependencies for $($agent.Name)..." -ForegroundColor Yellow
        Push-Location $agent.Dir
        npm install --silent
        Pop-Location
    }
    
    # Start the agent in a new window
    $title = "$($agent.Name) - Port $($agent.Port)"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location '$($agent.Dir)'; `$host.UI.RawUI.WindowTitle = '$title'; node server.js"
    )
    
    Write-Host "  ✓ $($agent.Name) started" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "All agents started!" -ForegroundColor Green
Write-Host ""
Write-Host "Health Check URLs:" -ForegroundColor Yellow
Write-Host "  Markup Agent:  http://localhost:3801/health"
Write-Host "  Style Agent:   http://localhost:3802/health"
Write-Host "  Script Agent:  http://localhost:3803/health"
Write-Host "  Python Agent:  http://localhost:3804/health"
Write-Host "  System Agent:  http://localhost:3805/health"
Write-Host ""
Write-Host "Press Ctrl+C in each window to stop individual agents" -ForegroundColor Gray
Write-Host ""

# Wait a moment for agents to start
Write-Host "Waiting for agents to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test health endpoints
Write-Host ""
Write-Host "Testing health endpoints..." -ForegroundColor Yellow
Write-Host ""

foreach ($agent in $agents) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$($agent.Port)/health" -TimeoutSec 2
        if ($response.status -eq "ok") {
            Write-Host "  ✓ $($agent.Name): " -NoNewline -ForegroundColor Green
            Write-Host "OK" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ✗ $($agent.Name): " -NoNewline -ForegroundColor Red
        Write-Host "Failed to connect" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "All Worker Agents are ready!" -ForegroundColor Green
Write-Host ""
