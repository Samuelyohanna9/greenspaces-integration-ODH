# UrbanGreen Auto-Refresh Script
# Automatically loads all 226k items in batches

$url = "https://urbangreen-tiles.urbangreen1.workers.dev/refresh?lang=en"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " UrbanGreen Batched Data Loader" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "This will load all 226,580 items in ~12 batches" -ForegroundColor Cyan
Write-Host "Estimated time: 3-4 minutes" -ForegroundColor Cyan
Write-Host ""

$maxBatches = 15
$batchNum = 0

for ($i = 1; $i -le $maxBatches; $i++) {
    $batchNum++
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "Batch $batchNum of ~12..." -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get
        
        if ($response.success) {
            $progress = $response.progress
            
            # Display progress
            Write-Host "  ✓ " -NoNewline -ForegroundColor Green
            Write-Host "Features loaded: " -NoNewline
            Write-Host "$($progress.totalFeatures.ToString('N0'))" -ForegroundColor Yellow
            
            Write-Host "  ✓ " -NoNewline -ForegroundColor Green
            Write-Host "Progress: " -NoNewline
            Write-Host "$($progress.percentComplete)%" -ForegroundColor Yellow
            
            Write-Host "  ✓ " -NoNewline -ForegroundColor Green
            Write-Host "Status: " -NoNewline
            Write-Host "$($response.message)" -ForegroundColor Yellow
            
            # Show last batch details if available
            if ($progress.lastBatch) {
                Write-Host "  → Pages $($progress.lastBatch.pages): $($progress.lastBatch.features) features in $($progress.lastBatch.elapsed)ms" -ForegroundColor DarkGray
            }
            
            # Check if complete
            if ($progress.isComplete) {
                Write-Host ""
                Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
                Write-Host ""
                Write-Host "🎉 COMPLETE!" -ForegroundColor Green
                Write-Host ""
                Write-Host "✓ All $($progress.totalFeatures.ToString('N0')) features loaded successfully!" -ForegroundColor Green
                Write-Host "✓ Your tiles are ready to use!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Test your map:" -ForegroundColor Cyan
                Write-Host "  Open your HTML page and pan around!" -ForegroundColor White
                Write-Host ""
                break
            }
        } else {
            Write-Host "  ✗ Error: $($response.error)" -ForegroundColor Red
            break
        }
    } catch {
        Write-Host "  ✗ Request failed: $_" -ForegroundColor Red
        Write-Host "  Retrying in 3 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
        continue
    }
    
    # Small delay between batches
    Write-Host ""
    if ($i -lt $maxBatches -and -not $progress.isComplete) {
        Write-Host "  Waiting 2 seconds before next batch..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Batched Loading Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Final status check
Write-Host "Checking final status..." -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri "https://urbangreen-tiles.urbangreen1.workers.dev/" -Method Get
    
    if ($status.metadata -and $status.metadata.en) {
        $meta = $status.metadata.en
        Write-Host ""
        Write-Host "Final Statistics:" -ForegroundColor Yellow
        Write-Host "  Total Features: $($meta.totalFeatures.ToString('N0'))" -ForegroundColor White
        Write-Host "  Last Refresh: $($meta.lastRefresh)" -ForegroundColor White
        Write-Host "  Version: $($meta.version)" -ForegroundColor White
    }
    
    if ($status.progress -and $status.progress.en) {
        $prog = $status.progress.en
        if ($prog.isComplete) {
            Write-Host ""
            Write-Host "✓ Data loading confirmed complete!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "Could not fetch final status" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open your map in browser" -ForegroundColor White
Write-Host "  2. Tiles should load in <100ms" -ForegroundColor White
Write-Host "  3. Pan around - different data loads instantly!" -ForegroundColor White
Write-Host ""