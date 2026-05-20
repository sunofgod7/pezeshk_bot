const fetch = require('node-fetch');

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

async function sendMessage(chatId, text) {
  const url = `${BALE_API}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
  return response.json();
}

async function getGeminiResponse(userMessage) {
  try {
    const systemPrompt = `تو یک دکتر بسیار با تجربه و متخصص هستی. وظیفه‌ات کمک به بیماران و پاسخ به سوالات پزشکی آنهاست.

رفتار تو باید این‌گونه باشه:
- با احترام و دلسوزی با بیماران صحبت کن
- سوالات دقیق و هدفمند برای تشخیص بهتر بپرس
- علائم را به دقت بررسی کن
- توصیه‌های پزشکی مفید و کاربردی بده
- در صورت لزوم، مراجعه به پزشک متخصص یا اورژانس را توصیه کن
- از زبان ساده و قابل فهم استفاده کن
- همیشه هشدار بده که تشخیص نهایی نیاز به معاینه حضوری دارد

سوال بیمار: ${userMessage}`;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      })
    });
    
    const data = await response.json();
    console.log('Gemini Response:', JSON.stringify(data));
    
    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return `خطا: ${data.error?.message || 'مشکل در ارتباط با Gemini'}`;
    }
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text;
    }
    
    return 'متاسفم، در حال حاضر نمی‌توانم به سوال شما پاسخ دهم. لطفا دوباره تلاش کنید.';
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return `خطا: ${error.message}`;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userMessage = update.message.text;

      const geminiResponse = await getGeminiResponse(userMessage);
      await sendMessage(chatId, geminiResponse);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ ok: true });
  }
};
