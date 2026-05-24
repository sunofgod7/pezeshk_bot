const fetch = require("node-fetch");

const BALE_TOKEN = process.env.BALE_TOKEN;

// ---------- API Key Management ----------
// جمع‌آوری تمام API Keyها از environment variables
const GEMINI_API_KEYS = [];

// خواندن تمام کلیدهای GEMINI_API_KEY_* از environment
for (let i = 1; i <= 100; i++) {
  const key = process.env[`GEMINI_API_KEY_${i}`];
  if (key) {
    GEMINI_API_KEYS.push({
      key: key,
      index: i,
      failCount: 0,
      lastFailTime: null,
    });
  }
}

// اگر کلید شماره‌گذاری نشده وجود داشت، اضافه کن
if (process.env.GEMINI_API_KEY && !GEMINI_API_KEYS.length) {
  GEMINI_API_KEYS.push({
    key: process.env.GEMINI_API_KEY,
    index: 0,
    failCount: 0,
    lastFailTime: null,
  });
}

if (!GEMINI_API_KEYS.length) {
  console.error("❌ هیچ GEMINI_API_KEY پیدا نشد!");
}

console.log(`✅ تعداد ${GEMINI_API_KEYS.length} API Key بارگذاری شد`);

// مدل‌های مختلف برای انواع درخواست
const TEXT_MODELS = ["gemini-3.1-flash-lite"];
const MEDIA_MODELS = ["gemini-3.5-flash", "gemini-3.0-flash", "gemini-2.5-flash"];

// تلاش مجدد با کلیدها و مدل‌های مختلف
async function callGeminiWithRetry(requestBody, isMediaRequest = false) {
  const models = isMediaRequest ? MEDIA_MODELS : TEXT_MODELS;
  let lastError = null;
  
  // برای هر API Key
  for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex++) {
    const apiKeyObj = GEMINI_API_KEYS[keyIndex];
    
    // برای هر مدل
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];
      
      try {
        const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeyObj.key}`;
        
        console.log(`[Gemini] کلید ${apiKeyObj.index}, مدل ${model} (${keyIndex + 1}/${GEMINI_API_KEYS.length}, ${modelIndex + 1}/${models.length})`);
        
        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        
        // بررسی خطای Quota
        if (!response.ok) {
          const errorMsg = data.error?.message || "";
          
          // اگر خطای Quota بود، مدل بعدی را امتحان کن
          if (
            errorMsg.includes("quota") ||
            errorMsg.includes("Quota exceeded") ||
            errorMsg.includes("rate limit") ||
            response.status === 429
          ) {
            console.log(`⚠️ کلید ${apiKeyObj.index} با مدل ${model} به Quota خورد`);
            apiKeyObj.failCount++;
            apiKeyObj.lastFailTime = Date.now();
            lastError = new Error(errorMsg);
            continue; // امتحان مدل بعدی
          }
          
          // خطاهای دیگر را مستقیماً برگردان
          throw new Error(errorMsg || `خطای Gemini: ${response.status}`);
        }

        // موفقیت
        console.log(`✅ درخواست با کلید ${apiKeyObj.index} و مدل ${model} موفق بود`);
        return data;
        
      } catch (error) {
        console.error(`❌ خطا با کلید ${apiKeyObj.index} و مدل ${model}:`, error.message);
        lastError = error;
      }
    }
  }
  
  throw lastError || new Error("تمام API Keyها و مدل‌ها به خطا خوردند");
}

const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;
const userSessions = new Map();

// ---------- helpers ----------
function toBase64(buf) {
  try {
    console.log(`[toBase64] Starting conversion for ${buf.length} bytes`);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
    }
    const result = Buffer.from(binary, "binary").toString("base64");
    console.log(`[toBase64] Conversion complete, base64 length: ${result.length}`);
    return result;
  } catch (error) {
    console.error(`[toBase64] Exception:`, error.message);
    throw error;
  }
}

function guessMime(path, current) {
  let mime = current;
  if (!mime || mime === "application/octet-stream") {
    const ext = path.split(".").pop()?.toLowerCase();
    const map = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
    };
    mime = (ext && map[ext]) || "image/jpeg";
  }
  return mime;
}

async function getFileBytes(fileId) {
  try {
    console.log(`[getFileBytes] Starting for fileId: ${fileId}`);
    const fileRes = await fetch(`${BALE_API}/getFile?file_id=${fileId}`);
    console.log(`[getFileBytes] getFile response status: ${fileRes.status}`);
    
    const fileText = await fileRes.text();
    console.log(`[getFileBytes] getFile response length: ${fileText.length}`);
    
    let fileJson;
    try {
      fileJson = JSON.parse(fileText);
    } catch {
      console.error(`[getFileBytes] JSON parse failed: ${fileText.slice(0, 200)}`);
      throw new Error(`getFile non-JSON: ${fileText.slice(0, 200)}`);
    }

    const filePath = fileJson?.result?.file_path;
    if (!filePath) {
      console.error(`[getFileBytes] No file_path in response: ${fileText.slice(0, 200)}`);
      throw new Error(`مسیر فایل پیدا نشد: ${fileText.slice(0, 200)}`);
    }

    console.log(`[getFileBytes] Downloading from path: ${filePath}`);
    const imgRes = await fetch(
      `https://tapi.bale.ai/file/bot${BALE_TOKEN}/${filePath}`,
    );
    console.log(`[getFileBytes] Download response status: ${imgRes.status}`);
    
    if (!imgRes.ok) {
      console.error(`[getFileBytes] Download failed with status: ${imgRes.status}`);
      throw new Error(`خطا در دانلود تصویر: ${imgRes.status}`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    console.log(`[getFileBytes] Downloaded ${arrayBuffer.byteLength} bytes`);
    
    const bytes = new Uint8Array(arrayBuffer);
    const mime = imgRes.headers.get("content-type")?.split(";")[0]?.trim() || "";
    
    console.log(`[getFileBytes] Success: ${bytes.length} bytes, mime: ${mime}`);
    return { bytes, mime, path: filePath };
  } catch (error) {
    console.error(`[getFileBytes] Exception:`, error.message, error.stack);
    throw error;
  }
}

// ---------- Bale sendMessage ----------
async function sendMessage(chatId, text, replyMarkup = null) {
  const MAX_LENGTH = 3500;

  if (text.length <= MAX_LENGTH) {
    const body = { chat_id: chatId, text };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(`${BALE_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  const parts = [];
  const paragraphs = text.split("\n\n");
  let currentPart = "";
  for (const paragraph of paragraphs) {
    if ((currentPart + "\n\n" + paragraph).length <= MAX_LENGTH) {
      currentPart += (currentPart ? "\n\n" : "") + paragraph;
    } else {
      if (currentPart) parts.push(currentPart.trim());
      currentPart =
        paragraph.length > MAX_LENGTH
          ? paragraph.substring(0, MAX_LENGTH)
          : paragraph;
    }
  }
  if (currentPart) parts.push(currentPart.trim());

  for (let i = 0; i < parts.length; i++) {
    const body = { chat_id: chatId, text: parts[i] };
    if (replyMarkup && i === parts.length - 1) body.reply_markup = replyMarkup;
    await fetch(`${BALE_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: true };
}

// ---------- Session ----------
function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, {
      history: [],
      visitStarted: false,
      labTestMode: false,
      medicineMode: false,
      mriMode: false,
    });
  }
  return userSessions.get(chatId);
}

function clearSession(chatId) {
  userSessions.delete(chatId);
}

// ---------- Voice to Text ----------
async function transcribeVoice(fileId) {
  try {
    console.log("[transcribeVoice] Starting transcription...");
    const { bytes, mime: ct, path } = await getFileBytes(fileId);
    console.log(`[transcribeVoice] File downloaded: ${bytes.length} bytes`);
    
    let mime = guessMime(path, ct);
    // Gemini supports audio formats, ensure proper mime type
    if (!mime.startsWith("audio/")) {
      mime = "audio/ogg"; // Default for Bale voice messages
    }
    
    const b64 = toBase64(bytes);
    console.log(`[transcribeVoice] Base64 encoded, mime: ${mime}`);

    const prompt = "لطفاً این فایل صوتی را به متن فارسی تبدیل کن. فقط متن گفته شده را بنویس، بدون توضیح اضافی.";

    console.log("[transcribeVoice] Calling Gemini API...");
    const data = await callGeminiWithRetry({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 2000,
      },
    }, true); // true = media request

    console.log(`[transcribeVoice] Gemini response received`);
    
    if (data.candidates?.[0]?.content) {
      const transcription = data.candidates[0].content.parts[0].text.trim();
      console.log(`[transcribeVoice] Success, transcription: ${transcription.substring(0, 100)}...`);
      return transcription;
    }
    
    console.error("[transcribeVoice] No content in response:", JSON.stringify(data));
    throw new Error("متن صوتی شناسایی نشد");
  } catch (error) {
    console.error("[transcribeVoice] Exception:", error.message, error.stack);
    throw error;
  }
}

// ---------- AI text ----------
async function getGeminiResponse(chatId, userMessage) {
  try {
    const session = getSession(chatId);
    const conversationHistory = session.history
      .map((msg) => `${msg.role === "user" ? "بیمار" : "دکتر"}: ${msg.content}`)
      .join("\n");

    const systemPrompt = `تو یک دکتر بسیار با تجربه و متخصص هستی. وظیفه‌ات کمک به بیماران و پاسخ به سوالات پزشکی آنهاست.

رفتار تو باید این‌گونه باشه:
- با احترام و دلسوزی با بیماران صحبت کن (بدون تعارفات زیاد)
- پاسخ‌هایت را کوتاه و مفید نگه دار (حداکثر 3-4 جمله)
- سوالات دقیق و هدفمند برای تشخیص بهتر بپرس
- علائم را به دقت بررسی کن
- حداقل 3-4 سوال مهم بپرس قبل از تشخیص نهایی
- توصیه‌های پزشکی مفید بده
- در صورت لزوم، مراجعه به پزشک متخصص را توصیه کن
- از زبان ساده استفاده کن
- همیشه هشدار بده که تشخیص نهایی نیاز به معاینه حضوری دارد

${conversationHistory ? "تاریخچه مکالمه:\n" + conversationHistory + "\n\n" : ""}پیام جدید بیمار: ${userMessage}`;

    const data = await callGeminiWithRetry({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 5000,
      },
    }, false); // false = text request

    if (data.candidates?.[0]?.content) {
      const aiResponse = data.candidates[0].content.parts[0].text;
      session.history.push({ role: "user", content: userMessage });
      session.history.push({ role: "assistant", content: aiResponse });
      if (session.history.length > 20)
        session.history = session.history.slice(-20);
      return aiResponse;
    }

    return "متاسفم، در حال حاضر نمی‌توانم پاسخ دهم.";
  } catch (error) {
    console.error("AI text error:", error.message);
    return `خطا: ${error.message}`;
  }
}

// ---------- AI vision ----------
async function analyzeImageWithGemini(fileId, prompt) {
  const { bytes, mime: ct, path } = await getFileBytes(fileId);
  const mime = guessMime(path, ct);
  const b64 = toBase64(bytes);

  console.log(`Image ready: ${bytes.length} bytes, mime: ${mime}`);

  const data = await callGeminiWithRetry({
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: b64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 5000,
    },
  }, true); // true = media request

  if (data.candidates?.[0]?.content) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error("پاسخی از Gemini دریافت نشد");
}

// ---------- MRI/Radiology analysis ----------
async function analyzeMRIImage(fileId) {
  try {
    console.log("[analyzeMRIImage] Starting...");
    const { bytes, mime: ct, path } = await getFileBytes(fileId);
    console.log(`[analyzeMRIImage] File downloaded: ${bytes.length} bytes`);
    
    const mime = guessMime(path, ct);
    const b64 = toBase64(bytes);
    console.log(`[analyzeMRIImage] Base64 encoded, mime: ${mime}`);

    const prompt = `تو یک رادیولوژیست و متخصص تصویربرداری پزشکی هستی که تصاویر MRI، CT Scan، رادیوگرافی و سونوگرافی را به زبان فارسی تحلیل می‌کنی.

از روی تصویر پزشکی:
۱) نوع تصویربرداری را مشخص کن (MRI، CT، X-Ray، سونوگرافی و...)
۲) ناحیه بدن و زاویه تصویربرداری را شناسایی کن
۳) یافته‌های قابل مشاهده را به صورت دقیق شرح بده:
   • 🔍 یافته‌های طبیعی
   • ⚠️ یافته‌های غیرطبیعی (در صورت وجود)
   • 📏 اندازه و موقعیت ضایعات (در صورت وجود)
   • 🎯 ساختارهای آناتومیک قابل مشاهده

۴) تفسیر بالینی:
   • احتمالات تشخیصی
   • توصیه‌های بالینی
   • نیاز به تصویربرداری‌های تکمیلی

۵) توضیحات ساده برای بیمار:
   • معنی یافته‌ها به زبان ساده
   • اهمیت بالینی
   • گام‌های بعدی پیشنهادی

۶) در انتها این هشدار را بیاور: «⚠️ این تحلیل صرفاً جنبه‌ی آموزشی دارد و جایگزین نظر رادیولوژیست و پزشک معالج نیست. حتماً با پزشک متخصص خود مشورت کنید.»

اگر تصویر واضح نیست، کیفیت پایین است یا تصویر پزشکی نیست، صادقانه بگو.
فقط فارسی بنویس و از Markdown و ایموجی استفاده کن.`;

    console.log("[analyzeMRIImage] Calling Gemini API...");
    const data = await callGeminiWithRetry({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }, true); // true = media request

    console.log(`[analyzeMRIImage] Gemini response received`);
    
    if (data.candidates?.[0]?.content) {
      const result = data.candidates[0].content.parts[0].text;
      console.log(`[analyzeMRIImage] Success, result length: ${result.length}`);
      return result;
    }
    
    console.error("[analyzeMRIImage] No content in response:", JSON.stringify(data));
    throw new Error("پاسخی از Gemini دریافت نشد");
  } catch (error) {
    console.error("[analyzeMRIImage] Exception:", error.message, error.stack);
    throw error;
  }
}

// ---------- Medicine analysis ----------
async function analyzeMedicineImage(fileId) {
  try {
    console.log("[analyzeMedicineImage] Starting...");
    const { bytes, mime: ct, path } = await getFileBytes(fileId);
    console.log(`[analyzeMedicineImage] File downloaded: ${bytes.length} bytes`);
    
    const mime = guessMime(path, ct);
    const b64 = toBase64(bytes);
    console.log(`[analyzeMedicineImage] Base64 encoded, mime: ${mime}`);

    const prompt = `تو یک داروساز و متخصص داروشناسی هستی که اطلاعات کامل درباره داروها به زبان فارسی ارائه می‌دهی.

از روی تصویر داروها:
۱) نام هر دارو را شناسایی کن (نام تجاری و نام ژنریک).
۲) برای هر دارو یک بخش جداگانه بساز شامل:
   • 💊 نام دارو
   • 🎯 کاربرد: این دارو برای چه بیماری‌ها یا علائمی استفاده می‌شود
   • 📊 دوز مصرف: دوز معمول برای بزرگسالان (و در صورت لزوم کودکان)
   • ⚠️ عوارض جانبی: عوارض شایع و مهم
   • 🔄 تداخلات دارویی: داروهایی که نباید همزمان مصرف شوند
   • ⏰ زمان مصرف: قبل/بعد غذا، صبح/شب و...
   • ⚡ نکات مهم: هشدارها و توصیه‌های ویژه

۳) اگر چند دارو با هم هستند، بررسی کن که آیا تداخل دارویی خطرناکی دارند یا نه.
۴) در انتها این هشدار را بیاور: «⚠️ این اطلاعات جنبه‌ی آموزشی دارد. حتماً با پزشک یا داروساز خود مشورت کنید و خودسرانه دارو مصرف نکنید.»

اگر تصویر واضح نیست یا دارو قابل شناسایی نیست، صادقانه بگو و راهنمایی کن.
فقط فارسی بنویس و از Markdown و ایموجی استفاده کن.`;

    console.log("[analyzeMedicineImage] Calling Gemini API...");
    const data = await callGeminiWithRetry({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }, true); // true = media request

    console.log(`[analyzeMedicineImage] Gemini response received`);
    
    if (data.candidates?.[0]?.content) {
      const result = data.candidates[0].content.parts[0].text;
      console.log(`[analyzeMedicineImage] Success, result length: ${result.length}`);
      return result;
    }
    
    console.error("[analyzeMedicineImage] No content in response:", JSON.stringify(data));
    throw new Error("پاسخی از Gemini دریافت نشد");
  } catch (error) {
    console.error("[analyzeMedicineImage] Exception:", error.message, error.stack);
    throw error;
  }
}

async function analyzeMedicineText(medicineText) {
  try {
    console.log("[analyzeMedicineText] Starting...");
    
    const prompt = `تو یک داروساز و متخصص داروشناسی هستی که اطلاعات کامل درباره داروها به زبان فارسی ارائه می‌دهی.

داروهای ذکر شده: ${medicineText}

برای هر دارو یک بخش جداگانه بساز شامل:
• 💊 نام دارو (تجاری و ژنریک)
• 🎯 کاربرد: این دارو برای چه بیماری‌ها یا علائمی استفاده می‌شود
• 📊 دوز مصرف: دوز معمول برای بزرگسالان (و در صورت لزوم کودکان)
• ⚠️ عوارض جانبی: عوارض شایع و مهم
• 🔄 تداخلات دارویی: داروهایی که نباید همزمان مصرف شوند
• ⏰ زمان مصرف: قبل/بعد غذا، صبح/شب و...
• ⚡ نکات مهم: هشدارها و توصیه‌های ویژه

اگر چند دارو ذکر شده، بررسی کن که آیا تداخل دارویی خطرناکی دارند یا نه.

در انتها این هشدار را بیاور: «⚠️ این اطلاعات جنبه‌ی آموزشی دارد. حتماً با پزشک یا داروساز خود مشورت کنید و خودسرانه دارو مصرف نکنید.»

فقط فارسی بنویس و از Markdown و ایموجی استفاده کن.`;

    console.log("[analyzeMedicineText] Calling Gemini API...");
    const data = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }, false); // false = text request

    console.log(`[analyzeMedicineText] Gemini response received`);
    
    if (data.candidates?.[0]?.content) {
      const result = data.candidates[0].content.parts[0].text;
      console.log(`[analyzeMedicineText] Success, result length: ${result.length}`);
      return result;
    }
    
    console.error("[analyzeMedicineText] No content in response:", JSON.stringify(data));
    throw new Error("پاسخی از Gemini دریافت نشد");
  } catch (error) {
    console.error("[analyzeMedicineText] Exception:", error.message, error.stack);
    throw error;
  }
}

// ---------- Lab test analysis ----------
async function analyzeLabTestImage(fileId) {
  try {
    console.log("[analyzeLabTestImage] Starting...");
    const { bytes, mime: ct, path } = await getFileBytes(fileId);
    console.log(`[analyzeLabTestImage] File downloaded: ${bytes.length} bytes`);
    
    const mime = guessMime(path, ct);
    const b64 = toBase64(bytes);
    console.log(`[analyzeLabTestImage] Base64 encoded, mime: ${mime}`);

    const prompt = `تو یک دستیار پزشکی هستی که نتایج آزمایش‌های پزشکی (خون، ادرار، بیوشیمی، هورمونی و …) را به زبان فارسی روان تحلیل می‌کنی.

از روی تصویرِ برگه‌ی آزمایش:
۱) نام آزمایش/پروفایل را بنویس.
۲) جدولی از هر شاخص بساز با ستون‌های: نام شاخص | مقدار بیمار | محدوده‌ی مرجع | وضعیت (طبیعی/بالا/پایین).
۳) برای هر مقدار غیرطبیعی، توضیح کوتاه و قابل فهم بده که این یعنی چه و معمولاً به چه دلایلی رخ می‌دهد.
۴) یک «جمع‌بندی کلی» در ۳–۵ خط بنویس.
۵) در صورت لزوم، «پیشنهاد گام بعدی» (مثل تکرار آزمایش، مراجعه به متخصص خاص، تغییر سبک زندگی) اضافه کن.
۶) در انتها این هشدار را بیاور: «⚠️ این تحلیل صرفاً جنبه‌ی آموزشی دارد و جایگزین نظر پزشک نیست.»

اگر تصویر برگه‌ی آزمایش نیست یا کیفیتش پایین است، صادقانه بگو و راهنمایی کن دوباره با کیفیت بهتر بفرستد.
فقط فارسی بنویس و از Markdown ساده استفاده کن.`;

    console.log("[analyzeLabTestImage] Calling Gemini API...");
    const data = await callGeminiWithRetry({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 5000,
      },
    }, true); // true = media request

    console.log(`[analyzeLabTestImage] Gemini response received`);
    
    if (data.candidates?.[0]?.content) {
      const result = data.candidates[0].content.parts[0].text;
      console.log(`[analyzeLabTestImage] Success, result length: ${result.length}`);
      return result;
    }
    
    console.error("[analyzeLabTestImage] No content in response:", JSON.stringify(data));
    throw new Error("پاسخی از Gemini دریافت نشد");
  } catch (error) {
    console.error("[analyzeLabTestImage] Exception:", error.message, error.stack);
    throw error;
  }
}

function wantsAnalysis(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return (
    c.includes("/analyze") ||
    c.includes("/test") ||
    caption.includes("تحلیل") ||
    caption.includes("آزمایش") ||
    caption.includes("ازمایش")
  );
}

function wantsMedicineAnalysis(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return (
    c.includes("/medicine") ||
    c.includes("/drug") ||
    caption.includes("دارو") ||
    caption.includes("قرص") ||
    caption.includes("داروی") ||
    caption.includes("داروها")
  );
}

function wantsMRIAnalysis(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return (
    c.includes("/mri") ||
    c.includes("/ct") ||
    c.includes("/xray") ||
    c.includes("/scan") ||
    c.includes("/radio") ||
    caption.includes("ام آر آی") ||
    caption.includes("ام ار ای") ||
    caption.includes("سی تی") ||
    caption.includes("سی‌تی") ||
    caption.includes("اسکن") ||
    caption.includes("رادیو") ||
    caption.includes("رادیولوژی") ||
    caption.includes("عکس") ||
    caption.includes("تصویر")
  );
}

function wantsMRIAnalysis(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return (
    c.includes("/mri") ||
    c.includes("/ct") ||
    c.includes("/xray") ||
    c.includes("/scan") ||
    c.includes("/radiology") ||
    caption.includes("ام آر آی") ||
    caption.includes("ام ار ای") ||
    caption.includes("سی تی") ||
    caption.includes("سی‌تی") ||
    caption.includes("اسکن") ||
    caption.includes("رادیولوژی") ||
    caption.includes("رادیوگرافی") ||
    caption.includes("سونوگرافی") ||
    caption.includes("سونو") ||
    caption.includes("اشعه")
  );
}

// ---------- Webhook ----------
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update.message) return res.status(200).json({ ok: true });

    const chatId = update.message.chat.id;
    const session = getSession(chatId);

    // عکس
    if (update.message.photo) {
      console.log("[Photo] Received photo message");
      
      if (!session.visitStarted) {
        console.log("[Photo] Visit not started, asking user to start");
        await sendMessage(
          chatId,
          'لطفا ابتدا "شروع ویزیت"، "تحلیل آزمایش"، "تحلیل دارو" یا "تحلیل MRI" را انتخاب کنید.',
        );
        return res.status(200).json({ ok: true });
      }

      const caption = update.message.caption || "";
      const analyzeTest = wantsAnalysis(caption);
      const analyzeMedicine = wantsMedicineAnalysis(caption);
      const analyzeMRI = wantsMRIAnalysis(caption);
      
      console.log(`[Photo] Caption: "${caption}", Test: ${analyzeTest}, Medicine: ${analyzeMedicine}, MRI: ${analyzeMRI}, Lab session: ${session.labTestMode}, Medicine session: ${session.medicineMode}, MRI session: ${session.mriMode}`);

      // تشخیص خودکار بر اساس حالت فعلی
      if (session.mriMode || analyzeMRI) {
        await sendMessage(
          chatId,
          "در حال تحلیل تصویر رادیولوژی… 🔬⏳ (ممکنه چند ثانیه طول بکشه)",
        );

        try {
          const photo = update.message.photo[update.message.photo.length - 1];
          console.log(`[Photo] Processing MRI image, file_id: ${photo.file_id}`);
          
          const analysis = await analyzeMRIImage(photo.file_id);
          console.log(`[Photo] MRI analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "🔬 تحلیل تصویر رادیولوژی:\n\n" + analysis);
          if (session.mriMode) session.mriMode = false;
        } catch (error) {
          console.error("[Photo] MRI error:", error.message, error.stack);
          await sendMessage(chatId, `❌ خطا در تحلیل تصویر: ${error.message}`);
        }
      } else if (session.medicineMode || analyzeMedicine) {
        await sendMessage(
          chatId,
          "در حال تحلیل داروها… 💊⏳ (ممکنه چند ثانیه طول بکشه)",
        );

        try {
          const photo = update.message.photo[update.message.photo.length - 1];
          console.log(`[Photo] Processing medicine image, file_id: ${photo.file_id}`);
          
          const analysis = await analyzeMedicineImage(photo.file_id);
          console.log(`[Photo] Medicine analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "💊 تحلیل داروها:\n\n" + analysis);
          if (session.medicineMode) session.medicineMode = false;
        } catch (error) {
          console.error("[Photo] Medicine error:", error.message, error.stack);
          await sendMessage(chatId, `❌ خطا در تحلیل دارو: ${error.message}`);
        }
      } else if (session.labTestMode || analyzeTest) {
        await sendMessage(
          chatId,
          "در حال تحلیل برگه‌ی آزمایش… 🧪⏳ (ممکنه چند ثانیه طول بکشه)",
        );

        try {
          const photo = update.message.photo[update.message.photo.length - 1];
          console.log(`[Photo] Processing lab test, file_id: ${photo.file_id}`);

          const analysis = await analyzeLabTestImage(photo.file_id);
          console.log(`[Photo] Lab analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "🔬 تحلیل آزمایش:\n\n" + analysis);
          if (session.labTestMode) session.labTestMode = false;
        } catch (error) {
          console.error("[Photo] Lab test error:", error.message, error.stack);
          await sendMessage(chatId, `❌ خطا در تحلیل آزمایش: ${error.message}`);
        }
      } else {
        await sendMessage(chatId, "⏳ در حال پردازش و تحلیل تصویر...");
        
        try {
          const photo = update.message.photo[update.message.photo.length - 1];
          console.log(`[Photo] Processing general image, file_id: ${photo.file_id}`);

          const prompt = "تو یک دکتر متخصص هستی. این تصویر مربوط به یک بیمار است. لطفا تصویر را تحلیل کن و توضیحات پزشکی مفید ارائه بده.";
          const analysis = await analyzeImageWithGemini(photo.file_id, prompt);
          console.log(`[Photo] General analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "🔬 تحلیل تصویر:\n\n" + analysis);
        } catch (error) {
          console.error("[Photo] General image error:", error.message, error.stack);
          await sendMessage(chatId, `❌ خطا در پردازش تصویر: ${error.message}`);
        }
      }

      return res.status(200).json({ ok: true });
    }

    // پیام صوتی (Voice)
    if (update.message.voice) {
      console.log("[Voice] Received voice message");
      
      if (!session.visitStarted) {
        console.log("[Voice] Visit not started, asking user to start");
        await sendMessage(
          chatId,
          'لطفا ابتدا "شروع ویزیت" را انتخاب کنید تا بتوانید پیام صوتی ارسال کنید.',
        );
        return res.status(200).json({ ok: true });
      }

      await sendMessage(chatId, "🎤 در حال پردازش پیام صوتی...");

      try {
        const voice = update.message.voice;
        console.log(`[Voice] Processing voice, file_id: ${voice.file_id}, duration: ${voice.duration}s`);
        
        // تبدیل صدا به متن
        const transcription = await transcribeVoice(voice.file_id);
        console.log(`[Voice] Transcription: ${transcription}`);
        
        if (!transcription || transcription.length < 3) {
          await sendMessage(chatId, "❌ متاسفانه نتوانستم صدای شما را تشخیص دهم. لطفا دوباره تلاش کنید یا پیام متنی ارسال کنید.");
          return res.status(200).json({ ok: true });
        }

        // نمایش متن شناسایی شده
        await sendMessage(chatId, `📝 متن شناسایی شده:\n"${transcription}"\n\n⏳ در حال پردازش پاسخ...`);
        
        // دریافت پاسخ از AI
        const geminiResponse = await getGeminiResponse(chatId, transcription);
        await sendMessage(chatId, geminiResponse);
        
      } catch (error) {
        console.error("[Voice] Error:", error.message, error.stack);
        await sendMessage(
          chatId,
          `❌ خطا در پردازش پیام صوتی: ${error.message}\n\nلطفا دوباره تلاش کنید یا پیام متنی ارسال کنید.`
        );
      }

      return res.status(200).json({ ok: true });
    }

    if (!update.message.text) return res.status(200).json({ ok: true });

    const userMessage = update.message.text;

    if (
      userMessage === "/start" ||
      userMessage === "شروع ویزیت" ||
      userMessage === "استارت ویزیت"
    ) {
      clearSession(chatId);
      const s = getSession(chatId);
      s.visitStarted = true;
      const keyboard = {
        keyboard: [
          [{ text: "تحلیل آزمایش" }, { text: "تحلیل دارو" }],
          [{ text: "تحلیل MRI" }],
          [{ text: "پایان ویزیت" }, { text: "شروع ویزیت جدید" }],
        ],
        resize_keyboard: true,
      };
      await sendMessage(
        chatId,
        "👨‍⚕️ سلام، من دکتر هوش مصنوعی شما هستم.\n\nلطفا مشکل یا علائم خود را توضیح دهید.\n\n🔬 می‌توانید نتایج آزمایش را برای تحلیل ارسال کنید.\n💊 می‌توانید داروهای مصرفی خود را برای تحلیل ارسال کنید.\n🩻 می‌توانید تصاویر MRI، CT، رادیوگرافی را برای تحلیل ارسال کنید.\n\n⚠️ توجه: این مشاوره جایگزین ویزیت حضوری نیست.",
        keyboard,
      );
    } else if (userMessage === "تحلیل آزمایش") {
      session.visitStarted = true;
      session.labTestMode = true;
      session.medicineMode = false;
      session.mriMode = false;
      await sendMessage(
        chatId,
        "🔬 لطفا نتایج آزمایش خود را ارسال کنید.\n\nمی‌توانید:\n• عکس آزمایش را ارسال کنید\n• یا نتایج را تایپ کنید",
      );
    } else if (userMessage === "تحلیل دارو") {
      session.visitStarted = true;
      session.medicineMode = true;
      session.labTestMode = false;
      session.mriMode = false;
      await sendMessage(
        chatId,
        "💊 لطفا داروهای مصرفی خود را ارسال کنید.\n\nمی‌توانید:\n• عکس داروها را ارسال کنید\n• یا نام داروها را تایپ کنید\n\nمثال: جنتامایسین، استامینوفن، ایبوپروفن",
      );
    } else if (userMessage === "تحلیل MRI" || userMessage === "تحلیل ام آر آی") {
      session.visitStarted = true;
      session.mriMode = true;
      session.labTestMode = false;
      session.medicineMode = false;
      await sendMessage(
        chatId,
        "🩻 لطفا تصویر رادیولوژی خود را ارسال کنید.\n\nانواع تصاویر قابل تحلیل:\n• MRI (ام آر آی)\n• CT Scan (سی تی اسکن)\n• X-Ray (رادیوگرافی)\n• سونوگرافی\n• و سایر تصاویر پزشکی\n\n💡 برای نتیجه بهتر، تصویر با کیفیت بالا ارسال کنید.",
      );
    } else if (userMessage === "پایان ویزیت") {
      clearSession(chatId);
      await sendMessage(
        chatId,
        "✅ ویزیت به پایان رسید.\n\nامیدوارم حالتان بهتر شود. 🏥 در صورت تشدید علائم، به پزشک مراجعه کنید.",
      );
    } else if (userMessage === "شروع ویزیت جدید") {
      clearSession(chatId);
      const s = getSession(chatId);
      s.visitStarted = true;
      const keyboard = {
        keyboard: [
          [{ text: "تحلیل آزمایش" }, { text: "تحلیل دارو" }],
          [{ text: "تحلیل MRI" }],
          [{ text: "پایان ویزیت" }, { text: "شروع ویزیت جدید" }],
        ],
        resize_keyboard: true,
      };
      await sendMessage(
        chatId,
        "👨‍⚕️ ویزیت جدید شروع شد.\n\nلطفا مشکل یا علائم خود را توضیح دهید.",
        keyboard,
      );
    } else {
      if (!session.visitStarted) {
        const keyboard = {
          keyboard: [
            [{ text: "شروع ویزیت" }],
            [{ text: "تحلیل آزمایش" }, { text: "تحلیل دارو" }],
            [{ text: "تحلیل MRI" }],
          ],
          resize_keyboard: true,
        };
        await sendMessage(
          chatId,
          "👋 سلام! لطفا یکی از گزینه‌ها را انتخاب کنید:\n\n• شروع ویزیت: مشاوره پزشکی\n• تحلیل آزمایش: تحلیل نتایج آزمایش\n• تحلیل دارو: اطلاعات کامل درباره داروها\n• تحلیل MRI: تحلیل تصاویر رادیولوژی",
          keyboard,
        );
      } else if (session.medicineMode) {
        try {
          await sendMessage(chatId, "⏳ در حال تحلیل داروها...");
          const analysis = await analyzeMedicineText(userMessage);
          await sendMessage(chatId, "💊 تحلیل داروها:\n\n" + analysis);
          session.medicineMode = false;
        } catch (e) {
          console.error("Medicine text exception:", e);
          await sendMessage(chatId, `خطا: ${e.message}`);
        }
      } else if (session.labTestMode) {
        try {
          await sendMessage(chatId, "⏳ در حال تحلیل آزمایش...");
          
          const prompt = `تو یک دکتر متخصص آزمایشگاه هستی. نتایج آزمایش را تحلیل کن، مقادیر غیرطبیعی را مشخص کن، توضیح ساده بده و توصیه‌های لازم را ارائه کن.\n\nنتایج: ${userMessage}`;
          
          const data = await callGeminiWithRetry({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              topK: 32,
              topP: 0.9,
              maxOutputTokens: 5000,
            },
          }, false); // false = text request
          
          if (data.candidates?.[0]?.content) {
            await sendMessage(
              chatId,
              "🔬 تحلیل آزمایش:\n\n" +
                data.candidates[0].content.parts[0].text,
            );
            session.labTestMode = false;
          } else {
            await sendMessage(chatId, "متاسفم، نتوانستم آزمایش را تحلیل کنم");
          }
        } catch (e) {
          console.error("Lab test text exception:", e);
          await sendMessage(chatId, `خطا: ${e.message}`);
        }
      } else {
        const geminiResponse = await getGeminiResponse(chatId, userMessage);
        await sendMessage(chatId, geminiResponse);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error:", error);
    res.status(200).json({ ok: true });
  }
};
