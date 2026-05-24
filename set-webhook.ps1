# جایگزین کردن توکن ربات
$TOKEN = "1885743172:WCYlN8s9X10_bqS3ZUEstmkvQmVGMP_MxW0"
$WEBHOOK_URL = "https://pezeshkbot-production.up.railway.app/webhook"

$body = @{
    url = $WEBHOOK_URL
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://tapi.bale.ai/bot$TOKEN/setWebhook" -Method Post -Body $body -ContentType "application/json"
