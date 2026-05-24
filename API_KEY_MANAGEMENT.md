# مدیریت API Key و مدل‌های Gemini

## نحوه کار سیستم

این ربات از سیستم هوشمند مدیریت API Key استفاده می‌کند که به صورت خودکار بین کلیدها و مدل‌های مختلف جابجا می‌شود.

## مدل‌های استفاده شده

### برای پیام‌های متنی (Text)
- **مدل**: `gemini-3.1-flash-lite`
- **ترتیب استفاده از API Keys**:
  1. `GEMINI_API_KEY_1` با مدل `gemini-3.1-flash-lite`
  2. اگر به لیمیت خورد → `GEMINI_API_KEY_2` با مدل `gemini-3.1-flash-lite`
  3. اگر به لیمیت خورد → `GEMINI_API_KEY_3` با مدل `gemini-3.1-flash-lite`
  4. و به همین ترتیب تا آخرین کلید

### برای صوت و تصویر (Media)
- **مدل‌ها**: `gemini-3.5-flash` → `gemini-3.0-flash` → `gemini-2.5-flash`
- **ترتیب استفاده**:
  1. `GEMINI_API_KEY_1` با مدل `gemini-3.5-flash`
  2. اگر به لیمیت خورد → `GEMINI_API_KEY_1` با مدل `gemini-3.0-flash`
  3. اگر به لیمیت خورد → `GEMINI_API_KEY_1` با مدل `gemini-2.5-flash`
  4. اگر به لیمیت خورد → `GEMINI_API_KEY_2` با مدل `gemini-3.5-flash`
  5. اگر به لیمیت خورد → `GEMINI_API_KEY_2` با مدل `gemini-3.0-flash`
  6. اگر به لیمیت خورد → `GEMINI_API_KEY_2` با مدل `gemini-2.5-flash`
  7. و به همین ترتیب تا آخرین کلید و آخرین مدل

## تنظیم API Keys

### روش 1: استفاده از فایل `.env`
```env
BALE_TOKEN=your_bot_token_here

GEMINI_API_KEY_1=your_first_gemini_api_key
GEMINI_API_KEY_2=your_second_gemini_api_key
GEMINI_API_KEY_3=your_third_gemini_api_key
# می‌توانید تا 100 کلید اضافه کنید
```

### روش 2: تنظیم در Vercel
1. وارد داشبورد پروژه در Vercel شوید
2. به بخش **Settings** → **Environment Variables** بروید
3. کلیدهای زیر را اضافه کنید:
   - `BALE_TOKEN`
   - `GEMINI_API_KEY_1`
   - `GEMINI_API_KEY_2`
   - `GEMINI_API_KEY_3`
   - و غیره...

## مزایای این سیستم

✅ **بدون قطعی سرویس**: اگر یک API Key به لیمیت برسد، خودکار از کلید بعدی استفاده می‌شود

✅ **بهینه‌سازی هزینه**: برای متن از مدل سبک‌تر و برای صوت/تصویر از مدل‌های قوی‌تر استفاده می‌شود

✅ **مقیاس‌پذیری**: می‌توانید تا 100 API Key اضافه کنید

✅ **لاگ کامل**: تمام تلاش‌ها و خطاها در کنسول ثبت می‌شوند

## نمونه لاگ‌ها

### برای پیام متنی:
```
[Gemini Text] تلاش با کلید 1 و مدل gemini-3.1-flash-lite
✅ درخواست با کلید 1 موفق بود
```

### برای صوت/تصویر (با خطای Quota):
```
[Gemini Media] تلاش با کلید 1 و مدل gemini-3.5-flash
⚠️ کلید 1 با مدل gemini-3.5-flash به Quota خورد، رفتن به مدل بعدی...
[Gemini Media] تلاش با کلید 1 و مدل gemini-3.0-flash
✅ درخواست با کلید 1 و مدل gemini-3.0-flash موفق بود
```

## توصیه‌ها

1. **حداقل 2-3 API Key** داشته باشید تا از قطعی سرویس جلوگیری شود
2. **لیمیت‌های روزانه** را مدیریت کنید
3. **لاگ‌ها را بررسی کنید** تا ببینید کدام کلیدها بیشتر استفاده می‌شوند
4. **API Keys را محرمانه** نگه دارید و در فایل `.env` قرار دهید

## دریافت API Key جدید

برای دریافت API Key رایگان Gemini:
1. به [Google AI Studio](https://makersuite.google.com/app/apikey) بروید
2. با اکانت Google خود وارد شوید
3. روی "Get API Key" کلیک کنید
4. API Key را کپی کنید و در `.env` قرار دهید
