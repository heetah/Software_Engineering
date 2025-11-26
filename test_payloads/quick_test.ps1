# 快速測試腳本 - 列出所有可用的測試工具
# 用法: .\quick_test.ps1

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  Test Payloads - Quick Test Menu" -ForegroundColor White
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "📋 Available Test Tools:`n" -ForegroundColor Yellow

Write-Host "1. Single Payload Test (Node.js)" -ForegroundColor Green
Write-Host "   Command: " -NoNewline -ForegroundColor Gray
Write-Host "node send_to_vision_agent.js <payload.json>" -ForegroundColor White
Write-Host "   Example: " -NoNewline -ForegroundColor Gray
Write-Host "node send_to_vision_agent.js example1_static_website.json`n" -ForegroundColor Cyan

Write-Host "2. Single Payload Test (PowerShell)" -ForegroundColor Green
Write-Host "   Command: " -NoNewline -ForegroundColor Gray
Write-Host ".\test_payload.ps1 <payload.json>" -ForegroundColor White
Write-Host "   Example: " -NoNewline -ForegroundColor Gray
Write-Host ".\test_payload.ps1 example1_static_website.json`n" -ForegroundColor Cyan

Write-Host "3. Batch Test (All Examples)" -ForegroundColor Green
Write-Host "   Command: " -NoNewline -ForegroundColor Gray
Write-Host "node batch_test.js" -ForegroundColor White
Write-Host "   Tests all example*.json files automatically`n" -ForegroundColor Gray

Write-Host "4. Setup Generation Test" -ForegroundColor Green
Write-Host "   Command: " -NoNewline -ForegroundColor Gray
Write-Host "node test_setup_generation.js" -ForegroundColor White
Write-Host "   Tests automatic setup file generation (mock mode)`n" -ForegroundColor Gray

Write-Host "`n📦 Available Payloads:`n" -ForegroundColor Yellow

Get-ChildItem -Filter "*.json" | Where-Object { 
    $_.Name -ne "package.json" -and $_.Name -ne "package-lock.json" 
} | Sort-Object Name | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 1)
    Write-Host "   • " -NoNewline -ForegroundColor Blue
    Write-Host "$($_.Name)" -NoNewline -ForegroundColor White
    Write-Host " ($size KB)" -ForegroundColor Gray
}

Write-Host "`n`n💡 Quick Actions:`n" -ForegroundColor Yellow

Write-Host "Test example 1 (Static Website):" -ForegroundColor Gray
Write-Host "   .\test_payload.ps1 example1_static_website.json`n" -ForegroundColor Cyan

Write-Host "Test example 2 (Task Manager with API):" -ForegroundColor Gray
Write-Host "   .\test_payload.ps1 example2_task_manager.json`n" -ForegroundColor Cyan

Write-Host "Test all examples:" -ForegroundColor Gray
Write-Host "   node batch_test.js`n" -ForegroundColor Cyan

Write-Host "`n📚 Documentation:" -ForegroundColor Yellow
Write-Host "   Read TEST_README.md for detailed instructions`n" -ForegroundColor White

Write-Host "============================================`n" -ForegroundColor Cyan

# 互動式選單
Write-Host "Would you like to run a test now? (y/n): " -NoNewline -ForegroundColor Yellow
$response = Read-Host

if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "`nSelect a test to run:" -ForegroundColor Cyan
    Write-Host "  1. Test example1_static_website.json" -ForegroundColor White
    Write-Host "  2. Test example2_task_manager.json" -ForegroundColor White
    Write-Host "  3. Test example3_chat_app.json" -ForegroundColor White
    Write-Host "  4. Run batch test (all examples)" -ForegroundColor White
    Write-Host "  5. Test setup generation" -ForegroundColor White
    Write-Host "  0. Cancel" -ForegroundColor Gray
    
    Write-Host "`nEnter your choice (0-5): " -NoNewline -ForegroundColor Yellow
    $choice = Read-Host
    
    switch ($choice) {
        "1" {
            Write-Host "`nRunning: .\test_payload.ps1 example1_static_website.json`n" -ForegroundColor Green
            .\test_payload.ps1 example1_static_website.json
        }
        "2" {
            Write-Host "`nRunning: .\test_payload.ps1 example2_task_manager.json`n" -ForegroundColor Green
            .\test_payload.ps1 example2_task_manager.json
        }
        "3" {
            Write-Host "`nRunning: .\test_payload.ps1 example3_chat_app.json`n" -ForegroundColor Green
            .\test_payload.ps1 example3_chat_app.json
        }
        "4" {
            Write-Host "`nRunning: node batch_test.js`n" -ForegroundColor Green
            node batch_test.js
        }
        "5" {
            Write-Host "`nRunning: node test_setup_generation.js`n" -ForegroundColor Green
            node test_setup_generation.js
        }
        "0" {
            Write-Host "`nCancelled.`n" -ForegroundColor Gray
        }
        default {
            Write-Host "`nInvalid choice.`n" -ForegroundColor Red
        }
    }
} else {
    Write-Host "`nOK. Run this script again when ready!`n" -ForegroundColor Gray
}
