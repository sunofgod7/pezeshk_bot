const fetch = require("node-fetch");

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
    });
  }
  return userSessions.get(chatId);
}

function clearSession(chatId) {
  userSessions.delete(chatId);
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

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 5000,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini text error:", JSON.stringify(data));
      return `خطا: ${data.error?.message || "مشکل در ارتباط با Gemini"}`;
    }

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

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini vision error:", JSON.stringify(data));
    throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
  }

  if (data.candidates?.[0]?.content) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error("پاسخی از Gemini دریافت نشد");
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
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    console.log(`[analyzeLabTestImage] Gemini response status: ${response.status}`);
    const data = await response.json();
    
    if (!response.ok) {
      console.error("[analyzeLabTestImage] Gemini error:", JSON.stringify(data));
      throw new Error(data.error?.message || `خطای Gemini: ${response.status}`);
    }

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
          'لطفا ابتدا "شروع ویزیت" یا "تحلیل آزمایش" را انتخاب کنید.',
        );
        return res.status(200).json({ ok: true });
      }

      const caption = update.message.caption || "";
      const analyze = wantsAnalysis(caption);
      
      console.log(`[Photo] Caption: "${caption}", Analysis mode: ${analyze}, Lab mode: ${session.labTestMode}`);

      await sendMessage(
        chatId,
        analyze
          ? "در حال تحلیل برگه‌ی آزمایش… 🧪⏳ (ممکنه چند ثانیه طول بکشه)"
          : "⏳ در حال پردازش و تحلیل تصویر...",
      );

      try {
        const photo = update.message.photo[update.message.photo.length - 1];
        console.log(`[Photo] Processing file_id: ${photo.file_id}`);

        if (analyze) {
          console.log("[Photo] Starting lab test analysis...");
          const analysis = await analyzeLabTestImage(photo.file_id);
          console.log(`[Photo] Analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "🔬 تحلیل آزمایش:\n\n" + analysis);
          if (session.labTestMode) session.labTestMode = false;
        } else {
          const prompt = session.labTestMode
            ? "تو یک دکتر متخصص آزمایشگاه هستی. این تصویر نتایج آزمایش یک بیمار است. لطفا:\n- تمام پارامترهای آزمایش را استخراج کن\n- مقادیر غیرطبیعی را مشخص کن\n- تحلیل کامل و توضیحات ساده ارائه بده\n- توصیه‌های لازم را بده\n- در انتها هشدار بده که این تحلیل جایگزین نظر پزشک نیست."
            : "تو یک دکتر متخصص هستی. این تصویر مربوط به یک بیمار است. لطفا تصویر را تحلیل کن و توضیحات پزشکی مفید ارائه بده.";

          console.log("[Photo] Starting general image analysis...");
          const analysis = await analyzeImageWithGemini(photo.file_id, prompt);
          console.log(`[Photo] Analysis complete, length: ${analysis.length}`);
          await sendMessage(chatId, "🔬 تحلیل تصویر:\n\n" + analysis);
          if (session.labTestMode) session.labTestMode = false;
        }
      } catch (error) {
        console.error("[Photo] Error:", error.message, error.stack);
        await sendMessage(chatId, `❌ خطا در پردازش تصویر: ${error.message}`);
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
          [{ text: "تحلیل آزمایش" }],
          [{ text: "پایان ویزیت" }, { text: "شروع ویزیت جدید" }],
        ],
        resize_keyboard: true,
      };
      await sendMessage(
        chatId,
        "👨‍⚕️ سلام، من دکتر هوش مصنوعی شما هستم.\n\nلطفا مشکل یا علائم خود را توضیح دهید.\n\n🔬 می‌توانید نتایج آزمایش (عکس یا متن) را برای تحلیل ارسال کنید.\n\n⚠️ توجه: این مشاوره جایگزین ویزیت حضوری نیست.",
        keyboard,
      );
    } else if (userMessage === "تحلیل آزمایش") {
      session.visitStarted = true;
      session.labTestMode = true;
      await sendMessage(
        chatId,
        "🔬 لطفا نتایج آزمایش خود را ارسال کنید.\n\nمی‌توانید:\n• عکس آزمایش را ارسال کنید\n• یا نتایج را تایپ کنید",
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
          [{ text: "تحلیل آزمایش" }],
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
          keyboard: [[{ text: "شروع ویزیت" }, { text: "تحلیل آزمایش" }]],
          resize_keyboard: true,
        };
        await sendMessage(
          chatId,
          "👋 سلام! لطفا یکی از گزینه‌ها را انتخاب کنید:\n\n• شروع ویزیت: مشاوره پزشکی\n• تحلیل آزمایش: تحلیل نتایج آزمایش",
          keyboard,
        );
      } else if (session.labTestMode) {
        try {
          const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `تو یک دکتر متخصص آزمایشگاه هستی. نتایج آزمایش را تحلیل کن، مقادیر غیرطبیعی را مشخص کن، توضیح ساده بده و توصیه‌های لازم را ارائه کن.\n\nنتایج: ${userMessage}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.7,
                topK: 32,
                topP: 0.9,
                maxOutputTokens: 5000,
              },
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            console.error("Lab test text error:", JSON.stringify(data));
            await sendMessage(
              chatId,
              `خطا: ${data.error?.message || "مشکل در تحلیل"}`,
            );
          } else if (data.candidates?.[0]?.content) {
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
