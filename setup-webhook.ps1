# اسکریپت تنظیم Webhook برای ربات بله

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "   تنظیم Webhook ربات بله" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# دریافت توکن ربات
$TOKEN = Read-Host "لطفا توکن ربات بله را وارد کنید"

if ([string]::IsNullOrWhiteSpace($TOKEN)) {
    Write-Host "❌ توکن نمی‌تواند خالی باشد!" -ForegroundColor Red
    exit 1
}

# دریافت URL
Write-Host ""
Write-Host "مثال URL: https://your-app.vercel.app/webhook" -ForegroundColor Yellow
$WEBHOOK_URL = Read-Host "لطفا URL webhook را وارد کنید"

if ([string]::IsNullOrWhiteSpace($WEBHOOK_URL)) {
    Write-Host "❌ URL نمی‌تواند خالی باشد!" -ForegroundColor Red
    exit 1
}

# اطمینان از اینکه URL با /webhook تمام می‌شود
if (-not $WEBHOOK_URL.EndsWith("/webhook")) {
    if ($WEBHOOK_URL.EndsWith("/")) {
        $WEBHOOK_URL = $WEBHOOK_URL + "webhook"
    } else {
        $WEBHOOK_URL = $WEBHOOK_URL + "/webhook"
    }
    Write-Host "⚠️  URL به /webhook تغییر یافت: $WEBHOOK_URL" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "در حال تنظیم webhook..." -ForegroundColor Cyan

try {
    $body = @{
        url = $WEBHOOK_URL
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "https://tapi.bale.ai/bot$TOKEN/setWebhook" -Method Post -Body $body -ContentType "application/json"
    
    Write-Host ""
    Write-Host "✅ Webhook با موفقیت تنظیم شد!" -ForegroundColor Green
    Write-Host ""
    Write-Host "اطلاعات:" -ForegroundColor Cyan
    Write-Host "  URL: $WEBHOOK_URL" -ForegroundColor White
    Write-Host "  پاسخ سرور: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ حالا می‌توانید به ربات پیام بدهید!" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ خطا در تنظیم webhook:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "لطفا موارد زیر را بررسی کنید:" -ForegroundColor Yellow
    Write-Host "  1. توکن ربات صحیح است؟" -ForegroundColor White
    Write-Host "  2. URL در دسترس است؟ (با مرورگر تست کنید)" -ForegroundColor White
    Write-Host "  3. اتصال اینترنت شما برقرار است؟" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "برای بررسی وضعیت webhook:" -ForegroundColor Cyan
Write-Host "  curl https://tapi.bale.ai/bot$TOKEN/getWebhookInfo" -ForegroundColor White
Write-Host ""
