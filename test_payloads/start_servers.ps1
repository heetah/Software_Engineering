# Start Both Agents for Demo
# This script starts vision-agent and coder-agent in separate PowerShell windows

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Vision-Agent and Coder-Agent" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start Vision-Agent in new window
Write-Host "[1/2] Starting Vision-Agent on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\vision-agent'; Write-Host 'Vision-Agent Server' -ForegroundColor Green; node server.js"

Start-Sleep -Seconds 2

# Start Coder-Agent in new window  
Write-Host "[2/2] Starting Coder-Agent on port 3800..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\coder-agent'; Write-Host 'Coder-Agent Server' -ForegroundColor Green; node server.js"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "✅ Both agents started!" -ForegroundColor Green
Write-Host ""
Write-Host "Services:" -ForegroundColor Cyan
Write-Host "  - Vision-Agent: http://localhost:3000" -ForegroundColor White
Write-Host "  - Coder-Agent:  http://localhost:3800" -ForegroundColor White
Write-Host ""
Write-Host "To test, run:" -ForegroundColor Yellow
Write-Host "  cd test_payloads" -ForegroundColor Gray
Write-Host "  .\test_architect_payload.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
