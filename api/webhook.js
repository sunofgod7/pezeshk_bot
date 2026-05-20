const fetch = require('node-fetch');

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

// حافظه موقت برای نگهداری تاریخچه مکالمات (در production باید از دیتابیس استفاده کنید)
const userSessions = new Map();

async function sendMessage(chatId, text, replyMarkup = null) {
  const url = `${BALE_API}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, {
      history: [],
      visitStarted: false
    });
  }
  return userSessions.get(chatId);
}

function clearSession(chatId) {
  userSessions.delete(chatId);
}

async function getGeminiResponse(chatId, userMessage) {
  try {
    const session = getSession(chatId);
    
    // ساخت تاریخچه مکالمه برای Gemini
    const conversationHistory = session.history.map(msg => 
      `${msg.role === 'user' ? 'بیمار' : 'دکتر'}: ${msg.content}`
    ).join('\n');
    
    const systemPrompt = `تو یک دکتر بسیار با تجربه و متخصص هستی. وظیفه‌ات کمک به بیماران و پاسخ به سوالات پزشکی آنهاست.

رفتار تو باید این‌گونه باشه:
- با احترام و دلسوزی با بیماران صحبت کن
- سوالات دقیق و هدفمند برای تشخیص بهتر بپرس (سن، جنسیت، مدت زمان علائم، شدت درد، سابقه بیماری و...)
- علائم را به دقت بررسی کن
- حداقل 3-4 سوال مهم بپرس قبل از اینکه تشخیص نهایی بدی
- توصیه‌های پزشکی مفید و کاربردی بده
- در صورت لزوم، مراجعه به پزشک متخصص یا اورژانس را توصیه کن
- از زبان ساده و قابل فهم استفاده کن
- همیشه هشدار بده که تشخیص نهایی نیاز به معاینه حضوری دارد

${conversationHistory ? 'تاریخچه مکالمه:\n' + conversationHistory + '\n\n' : ''}پیام جدید بیمار: ${userMessage}`;

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
    
    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return `خطا: ${data.error?.message || 'مشکل در ارتباط با Gemini'}`;
    }
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      // ذخیره در تاریخچه
      session.history.push({ role: 'user', content: userMessage });
      session.history.push({ role: 'assistant', content: aiResponse });
      
      // محدود کردن تاریخچه به 20 پیام آخر
      if (session.history.length > 20) {
        session.history = session.history.slice(-20);
      }
      
      return aiResponse;
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
      const session = getSession(chatId);

      // دستورات خاص
      if (userMessage === '/start' || userMessage.toLowerCase() === 'شروع ویزیت' || userMessage.toLowerCase() === 'استارت ویزیت') {
        clearSession(chatId);
        const newSession = getSession(chatId);
        newSession.visitStarted = true;
        
        const keyboard = {
          keyboard: [
            [{ text: 'پایان ویزیت' }],
            [{ text: 'شروع ویزیت جدید' }]
          ],
          resize_keyboard: true
        };
        
        await sendMessage(
          chatId, 
          '👨‍⚕️ سلام، من دکتر هوش مصنوعی شما هستم.\n\nلطفا مشکل یا علائم خود را به طور کامل توضیح دهید. من چند سوال از شما خواهم پرسید تا بتوانم بهترین راهنمایی را به شما ارائه دهم.\n\n⚠️ توجه: این مشاوره جایگزین ویزیت حضوری نزد پزشک نیست.',
          keyboard
        );
        
      } else if (userMessage.toLowerCase() === 'پایان ویزیت') {
        clearSession(chatId);
        await sendMessage(
          chatId,
          '✅ ویزیت به پایان رسید.\n\nامیدوارم که به زودی حالتان بهتر شود. در صورت نیاز به مشاوره مجدد، روی "شروع ویزیت جدید" کلیک کنید.\n\n🏥 در صورت تشدید علائم، حتما به پزشک مراجعه کنید.'
        );
        
      } else if (userMessage.toLowerCase() === 'شروع ویزیت جدید') {
        clearSession(chatId);
        const newSession = getSession(chatId);
        newSession.visitStarted = true;
        
        await sendMessage(
          chatId,
          '👨‍⚕️ ویزیت جدید شروع شد.\n\nلطفا مشکل یا علائم خود را توضیح دهید.'
        );
        
      } else {
        // بررسی اینکه آیا ویزیت شروع شده یا نه
        if (!session.visitStarted) {
          const keyboard = {
            keyboard: [
              [{ text: 'شروع ویزیت' }]
            ],
            resize_keyboard: true
          };
          
          await sendMessage(
            chatId,
            '👋 سلام! برای شروع مشاوره پزشکی، لطفا روی دکمه "شروع ویزیت" کلیک کنید.',
            keyboard
          );
        } else {
          // پاسخ به سوال بیمار
          const geminiResponse = await getGeminiResponse(chatId, userMessage);
          await sendMessage(chatId, geminiResponse);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ ok: true });
  }
};
