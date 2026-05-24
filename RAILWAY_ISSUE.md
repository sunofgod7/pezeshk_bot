# مشکل Railway و دسترسی به Bale API

## مشکل

خطای `ETIMEDOUT` نشان می‌دهد که سرور Railway نمی‌تواند به `tapi.bale.ai` متصل شود:

```
FetchError: request to https://tapi.bale.ai/bot.../sendMessage failed
reason: connect ETIMEDOUT 2.189.68.126:443
```

## علت

Railway از سرورهای خارج از ایران استفاده می‌کند و به دلیل محدودیت‌های شبکه، نمی‌تواند به سرورهای ایرانی (مثل Bale API) دسترسی داشته باشد.

## راه‌حل‌ها

### راه‌حل 1: استفاده از Vercel (توصیه می‌شود) ✅

Vercel معمولاً مشکل کمتری با سرورهای ایرانی دارد.

#### نصب Vercel CLI:
```bash
npm install -g vercel
```

#### دیپلوی:
```bash
vercel
```

#### تنظیم Environment Variables در Vercel:
```bash
vercel env add BALE_TOKEN
vercel env add GEMINI_API_KEY_1
vercel env add GEMINI_API_KEY_2
# و غیره...
```

یا از داشبورد Vercel:
1. Settings → Environment Variables
2. اضافه کردن متغیرها

#### تنظیم Webhook:
```bash
curl -X POST "https://tapi.bale.ai/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-project.vercel.app/webhook"}'
```

### راه‌حل 2: استفاده از سرور ایرانی

#### گزینه‌های سرور ایرانی:
- **Arvan Cloud** (https://arvancloud.ir)
- **Liara** (https://liara.ir)
- **Iran Server** (https://iranserver.com)

#### مزایا:
- دسترسی مستقیم به Bale API
- سرعت بالاتر برای کاربران ایرانی
- بدون مشکل timeout

### راه‌حل 3: استفاده از Proxy (پیچیده)

اگر حتماً می‌خواهید از Railway استفاده کنید، باید یک proxy ایرانی راه‌اندازی کنید که درخواست‌ها را به Bale API forward کند.

**توجه:** این روش پیچیده است و توصیه نمی‌شود.

### راه‌حل 4: استفاده از Render.com

Render.com هم مثل Vercel گاهی با سرورهای ایرانی کار می‌کند.

#### دیپلوی در Render:
1. به https://render.com بروید
2. New → Web Service
3. مخزن GitHub را متصل کنید
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Environment Variables را اضافه کنید

## توصیه نهایی

**بهترین گزینه: Vercel**

چرا Vercel؟
- ✅ رایگان
- ✅ راه‌اندازی آسان
- ✅ معمولاً با Bale API کار می‌کند
- ✅ سرعت بالا
- ✅ پشتیبانی از Serverless Functions

## مراحل مهاجرت از Railway به Vercel

### 1. نصب Vercel CLI
```bash
npm install -g vercel
```

### 2. لاگین
```bash
vercel login
```

### 3. دیپلوی
```bash
vercel
```

### 4. تنظیم Environment Variables
```bash
vercel env add BALE_TOKEN
# مقدار را وارد کنید: 1885743172:WCYlN8s9X10_bqS3ZUEstmkvQmVGMP_MxW0

vercel env add GEMINI_API_KEY_1
# مقدار را وارد کنید

vercel env add GEMINI_API_KEY_2
# مقدار را وارد کنید

# و غیره برای بقیه کلیدها
```

### 5. دیپلوی مجدد با Environment Variables
```bash
vercel --prod
```

### 6. تنظیم Webhook
بعد از دیپلوی، URL شما چیزی شبیه این خواهد بود:
```
https://your-project.vercel.app
```

Webhook را تنظیم کنید:
```bash
curl -X POST "https://tapi.bale.ai/bot1885743172:WCYlN8s9X10_bqS3ZUEstmkvQmVGMP_MxW0/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-project.vercel.app/webhook"}'
```

یا با PowerShell:
```powershell
.\setup-webhook.ps1
# و URL جدید Vercel را وارد کنید
```

### 7. تست
به ربات پیام بدهید و بررسی کنید که کار می‌کند.

## بررسی لاگ‌ها

### در Vercel:
```bash
vercel logs
```

یا از داشبورد Vercel → Deployments → View Function Logs

## سوالات متداول

**Q: آیا Vercel رایگان است؟**
A: بله، برای پروژه‌های کوچک کاملاً رایگان است.

**Q: آیا باید کد را تغییر دهم؟**
A: خیر، کد فعلی با Vercel کار می‌کند.

**Q: چگونه می‌توانم مطمئن شوم که Vercel با Bale کار می‌کند؟**
A: بعد از دیپلوی، webhook را تنظیم کنید و به ربات پیام بدهید. اگر پاسخ داد، یعنی کار می‌کند.

**Q: اگر Vercel هم کار نکرد چه کنم؟**
A: از یک سرور ایرانی مثل Liara یا Arvan Cloud استفاده کنید.
