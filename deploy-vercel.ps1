# اسکریپت دیپلوی سریع در Vercel

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "   دیپلوی در Vercel" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# بررسی نصب Vercel CLI
Write-Host "بررسی نصب Vercel CLI..." -ForegroundColor Cyan
try {
    $vercelVersion = vercel --version 2>$null
    Write-Host "✅ Vercel CLI نصب شده است (نسخه: $vercelVersion)" -ForegroundColor Green
} catch {
    Write-Host "❌ Vercel CLI نصب نیست!" -ForegroundColor Red
    Write-Host ""
    Write-Host "لطفا ابتدا Vercel CLI را نصب کنید:" -ForegroundColor Yellow
    Write-Host "  npm install -g vercel" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "آیا می‌خواهید ادامه دهید؟ (y/n)" -ForegroundColor Yellow
$continue = Read-Host

if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "لغو شد." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "در حال دیپلوی..." -ForegroundColor Cyan
Write-Host ""

# دیپلوی
try {
    vercel --prod
    
    Write-Host ""
    Write-Host "✅ دیپلوی با موفقیت انجام شد!" -ForegroundColor Green
    Write-Host ""
    Write-Host "مراحل بعدی:" -ForegroundColor Cyan
    Write-Host "  1. URL پروژه را از خروجی بالا کپی کنید" -ForegroundColor White
    Write-Host "  2. Environment Variables را در Vercel تنظیم کنید:" -ForegroundColor White
    Write-Host "     - BALE_TOKEN" -ForegroundColor Gray
    Write-Host "     - GEMINI_API_KEY_1" -ForegroundColor Gray
    Write-Host "     - GEMINI_API_KEY_2" -ForegroundColor Gray
    Write-Host "     - و غیره..." -ForegroundColor Gray
    Write-Host "  3. Webhook را با اسکریپت setup-webhook.ps1 تنظیم کنید" -ForegroundColor White
    Write-Host ""
    Write-Host "برای تنظیم Environment Variables:" -ForegroundColor Cyan
    Write-Host "  vercel env add BALE_TOKEN" -ForegroundColor White
    Write-Host "  vercel env add GEMINI_API_KEY_1" -ForegroundColor White
    Write-Host "  vercel env add GEMINI_API_KEY_2" -ForegroundColor White
    Write-Host ""
    Write-Host "یا از داشبورد Vercel:" -ForegroundColor Cyan
    Write-Host "  Settings → Environment Variables" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ خطا در دیپلوی:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "لطفا ابتدا لاگین کنید:" -ForegroundColor Yellow
    Write-Host "  vercel login" -ForegroundColor White
    Write-Host ""
    exit 1
}
