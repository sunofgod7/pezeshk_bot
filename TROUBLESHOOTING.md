# راهنمای عیب‌یابی

## مشکل: ربات پاسخ نمی‌دهد

### گام 1: بررسی لاگ‌های سرور

اگر در لاگ‌های Railway/Vercel فقط این پیام‌ها را می‌بینید:
```
✅ تعداد X API Key بارگذاری شد
Server running on port 8080
```

یعنی سرور روشن است ولی webhook تنظیم نشده یا درخواستی دریافت نمی‌کند.

### گام 2: بررسی Webhook

#### روش 1: استفاده از PowerShell (Windows)
```powershell
.\check-webhook.ps1
```

#### روش 2: استفاده از curl
```bash
curl https://tapi.bale.ai/bot<YOUR_TOKEN>/getWebhookInfo
```

**پاسخ صحیح باید شامل URL شما باشد:**
```json
{
  "ok": true,
  "result": {
    "url": "https://your-app.railway.app/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### گام 3: تنظیم مجدد Webhook

#### روش 1: استفاده از PowerShell
```powershell
.\setup-webhook.ps1
```

#### روش 2: استفاده از curl
```bash
curl -X POST "https://tapi.bale.ai/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.railway.app/webhook"}'
```

**نکته مهم:** URL باید با `/webhook` تمام شود نه `/api/webhook`

### گام 4: تست سرور

بررسی کنید که سرور در دسترس است:

```bash
# تست health check
curl https://your-app.railway.app/health

# باید پاسخ بدهد:
{"status":"ok"}
```

### گام 5: بررسی Environment Variables

مطمئن شوید که این متغیرها تنظیم شده‌اند:

```env
BALE_TOKEN=your_bot_token
GEMINI_API_KEY_1=your_first_key
GEMINI_API_KEY_2=your_second_key
```

در Railway:
1. وارد پروژه شوید
2. به تب **Variables** بروید
3. بررسی کنید که تمام متغیرها موجود هستند

## مشکلات رایج

### 1. خطای "Webhook URL is not valid"
- مطمئن شوید URL با `https://` شروع می‌شود
- URL باید در دسترس عمومی باشد (نه localhost)
- URL باید با `/webhook` تمام شود

### 2. خطای "Unauthorized"
- توکن ربات را بررسی کنید
- مطمئن شوید `BALE_TOKEN` در environment variables تنظیم شده

### 3. خطای "API Key not found"
- حداقل یک `GEMINI_API_KEY_1` باید تنظیم شده باشد
- API Key را از [Google AI Studio](https://makersuite.google.com/app/apikey) دریافت کنید

### 4. ربات پیام می‌گیرد ولی پاسخ نمی‌دهد
- لاگ‌های سرور را بررسی کنید
- ممکن است API Key به لیمیت رسیده باشد
- API Key دیگری اضافه کنید

## بررسی لاگ‌ها

### در Railway:
1. وارد پروژه شوید
2. به تب **Deployments** بروید
3. روی آخرین deployment کلیک کنید
4. لاگ‌ها را مشاهده کنید

### لاگ‌های مفید:

**درخواست دریافت شد:**
```
[2024-01-01T12:00:00.000Z] POST /webhook
```

**API Key استفاده شد:**
```
[Gemini Text] تلاش با کلید 1 و مدل gemini-3.1-flash-lite
✅ درخواست با کلید 1 موفق بود
```

**خطای Quota:**
```
⚠️ کلید 1 به Quota خورد، رفتن به کلید بعدی...
```

## تست دستی

برای تست اینکه webhook کار می‌کند:

```bash
curl -X POST "https://your-app.railway.app/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "chat": {"id": 123456},
      "text": "/start"
    }
  }'
```

اگر سرور کار می‌کند، باید در لاگ‌ها ببینید که پیام پردازش شده.

## کمک بیشتر

اگر مشکل حل نشد:
1. لاگ‌های کامل را کپی کنید
2. خطای دقیق را یادداشت کنید
3. بررسی کنید که تمام فایل‌ها به درستی deploy شده‌اند
4. سرویس را restart کنید

## چک‌لیست نهایی

- [ ] سرور روشن است (لاگ "Server running" را می‌بینید)
- [ ] Webhook تنظیم شده (`getWebhookInfo` URL را نشان می‌دهد)
- [ ] Environment variables تنظیم شده‌اند
- [ ] حداقل یک API Key معتبر دارید
- [ ] URL سرور در دسترس است (health check پاسخ می‌دهد)
- [ ] توکن ربات صحیح است
