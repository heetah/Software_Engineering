# PowerShell 版本的測試腳本
# 用法: .\test_payload.ps1 example1_static_website.json

param(
    [Parameter(Mandatory=$false)]
    [string]$PayloadFile
)

$VisionAgentUrl = if ($env:VISION_AGENT_URL) { $env:VISION_AGENT_URL } else { "http://localhost:3000" }
$ApiEndpoint = "$VisionAgentUrl/api/vision/analyze"

function Write-ColorMessage {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

if (-not $PayloadFile) {
    Write-ColorMessage "`nUsage: .\test_payload.ps1 <payload_file.json>" "Yellow"
    Write-ColorMessage "`nExamples:" "Cyan"
    Write-ColorMessage "  .\test_payload.ps1 example1_static_website.json" "Blue"
    Write-ColorMessage "  .\test_payload.ps1 example2_task_manager.json" "Blue"
    Write-ColorMessage "  .\test_payload.ps1 example3_chat_app.json" "Blue"
    
    Write-ColorMessage "`nAvailable payloads in current directory:" "Cyan"
    Get-ChildItem -Filter "*.json" | Where-Object { $_.Name -ne "package.json" } | ForEach-Object {
        Write-ColorMessage "  - $($_.Name)" "Blue"
    }
    
    exit 0
}

# 檢查檔案是否存在
if (-not (Test-Path $PayloadFile)) {
    Write-ColorMessage "`n❌ Error: File not found: $PayloadFile" "Red"
    exit 1
}

# 讀取並驗證 JSON
Write-ColorMessage "`n📦 Loading payload: $PayloadFile" "Cyan"

try {
    $payloadContent = Get-Content $PayloadFile -Raw
    $payload = $payloadContent | ConvertFrom-Json
    
    Write-ColorMessage "✅ Payload loaded successfully" "Green"
    
    $fileCount = if ($payload.output.coder_instructions.files) { 
        $payload.output.coder_instructions.files.Count 
    } else { 0 }
    
    $hasContracts = if ($payload.output.coder_instructions.contracts) { "true" } else { "false" }
    $hasSetup = if ($payload.output.coder_instructions.setup) { "true" } else { "false" }
    
    Write-ColorMessage "   Files: $fileCount" "Blue"
    Write-ColorMessage "   Has contracts: $hasContracts" "Blue"
    Write-ColorMessage "   Has setup: $hasSetup" "Blue"
    
} catch {
    Write-ColorMessage "`n❌ Error: Invalid JSON in $PayloadFile" "Red"
    Write-ColorMessage "   $($_.Exception.Message)" "Red"
    exit 1
}

# 發送到 Vision Agent
Write-ColorMessage "`n🚀 Sending to Vision Agent: $ApiEndpoint" "Cyan"

$startTime = Get-Date

try {
    $response = Invoke-RestMethod -Uri $ApiEndpoint -Method Post `
        -Body $payloadContent -ContentType "application/json" `
        -TimeoutSec 300
    
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 2)
    
    Write-ColorMessage "`n✅ Vision Agent response received ($($elapsed)s)" "Green"
    
    if ($response.request_id) {
        Write-ColorMessage "   Request ID: $($response.request_id)" "Blue"
    }
    
    if ($response.files) {
        Write-ColorMessage "   Files generated: $($response.files.Count)" "Green"
        
        Write-ColorMessage "`n📄 Generated files:" "Cyan"
        $idx = 1
        foreach ($file in $response.files) {
            $fileType = if ($file.language) { $file.language } else { "unknown" }
            Write-ColorMessage "   $idx. $($file.path) ($fileType)" "Blue"
            $idx++
        }
    }
    
    if ($response.metadata) {
        Write-ColorMessage "`n📊 Metadata:" "Cyan"
        $response.metadata.PSObject.Properties | ForEach-Object {
            Write-ColorMessage "   $($_.Name): $($_.Value)" "Blue"
        }
    }
    
    if ($response.notes) {
        Write-ColorMessage "`n📝 Notes:" "Cyan"
        foreach ($note in $response.notes) {
            Write-ColorMessage "   - $note" "Yellow"
        }
    }
    
    # 儲存回應
    $outputDir = Join-Path $PSScriptRoot "..\responses"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($PayloadFile)
    $outputPath = Join-Path $outputDir "$baseName-response-$timestamp.json"
    
    $response | ConvertTo-Json -Depth 10 | Set-Content $outputPath
    Write-ColorMessage "`n💾 Response saved to: $outputPath" "Green"
    
    # 提供下一步建議
    Write-ColorMessage "`n💡 Next steps:" "White"
    Write-ColorMessage "   1. View generated files in Vision Agent dashboard: $VisionAgentUrl/dashboard" "Yellow"
    Write-ColorMessage "   2. Check response details: cat $outputPath" "Yellow"
    if ($response.request_id) {
        Write-ColorMessage "   3. View status page: $VisionAgentUrl/outputs/$($response.request_id)/status.html" "Yellow"
    }
    
} catch {
    Write-ColorMessage "`n❌ Error occurred:" "Red"
    
    if ($_.Exception.Message -match "Unable to connect") {
        Write-ColorMessage "   Cannot connect to Vision Agent at $VisionAgentUrl" "Red"
        Write-ColorMessage "   Make sure Vision Agent is running: cd vision-agent; node server.js" "Yellow"
    } else {
        Write-ColorMessage "   $($_.Exception.Message)" "Red"
    }
    
    exit 1
}
