# اسکریپت بررسی وضعیت Webhook

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "   بررسی وضعیت Webhook" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$TOKEN = Read-Host "لطفا توکن ربات بله را وارد کنید"

if ([string]::IsNullOrWhiteSpace($TOKEN)) {
    Write-Host "❌ توکن نمی‌تواند خالی باشد!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "در حال دریافت اطلاعات webhook..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "https://tapi.bale.ai/bot$TOKEN/getWebhookInfo" -Method Get
    
    Write-Host ""
    Write-Host "✅ اطلاعات Webhook:" -ForegroundColor Green
    Write-Host ""
    
    if ($response.result.url) {
        Write-Host "  📍 URL: $($response.result.url)" -ForegroundColor White
        Write-Host "  ✅ وضعیت: فعال" -ForegroundColor Green
        
        if ($response.result.pending_update_count) {
            Write-Host "  📊 پیام‌های در انتظار: $($response.result.pending_update_count)" -ForegroundColor Yellow
        } else {
            Write-Host "  📊 پیام‌های در انتظار: 0" -ForegroundColor Green
        }
        
        if ($response.result.last_error_date) {
            Write-Host "  ⚠️  آخرین خطا: $($response.result.last_error_message)" -ForegroundColor Red
            $errorDate = [DateTimeOffset]::FromUnixTimeSeconds($response.result.last_error_date).LocalDateTime
            Write-Host "  🕐 زمان خطا: $errorDate" -ForegroundColor Red
        } else {
            Write-Host "  ✅ بدون خطا" -ForegroundColor Green
        }
        
    } else {
        Write-Host "  ⚠️  Webhook تنظیم نشده است!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "برای تنظیم webhook از اسکریپت setup-webhook.ps1 استفاده کنید" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "پاسخ کامل سرور:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor Gray
    
} catch {
    Write-Host ""
    Write-Host "❌ خطا در دریافت اطلاعات:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
