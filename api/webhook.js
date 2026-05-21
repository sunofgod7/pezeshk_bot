const fetch = require('node-fetch');

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

// حافظه موقت برای نگهداری تاریخچه مکالمات
const userSessions = new Map();

async function sendMessage(chatId, text, replyMarkup = null) {
  const MAX_LENGTH = 3500;
  
  if (text.length <= MAX_LENGTH) {
    const url = `${BALE_API}/sendMessage`;
    const body = { chat_id: chatId, text: text };
    if (replyMarkup) body.reply_markup = replyMarkup;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }
  
  // تقسیم پیام بلند
  const parts = [];
  const paragraphs = text.split('\n\n');
  let currentPart = '';
  
  for (const paragraph of paragraphs) {
    if ((currentPart + '\n\n' + paragraph).length <= MAX_LENGTH) {
      currentPart += (currentPart ? '\n\n' : '') + paragraph;
    } else {
      if (currentPart) parts.push(currentPart.trim());
      currentPart = paragraph.length > MAX_LENGTH ? paragraph.substring(0, MAX_LENGTH) : paragraph;
    }
  }
  
  if (currentPart) parts.push(currentPart.trim());
  
  for (let i = 0; i < parts.length; i++) {
    const url = `${BALE_API}/sendMessage`;
    const body = { chat_id: chatId, text: parts[i] };
    if (replyMarkup && i === parts.length - 1) body.reply_markup = replyMarkup;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (i < parts.length - 1) await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  return { ok: true };
}

function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, { history: [], visitStarted: false, labTestMode: false });
  }
  return userSessions.get(chatId);
}

function clearSession(chatId) {
  userSessions.delete(chatId);
}

async function getGeminiResponse(chatId, userMessage) {
  try {
    const session = getSession(chatId);
    const conversationHistory = session.history.map(msg => 
      `${msg.role === 'user' ? 'بیمار' : 'دکتر'}: ${msg.content}`
    ).join('\n');
    
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

${conversationHistory ? 'تاریخچه مکالمه:\n' + conversationHistory + '\n\n' : ''}پیام جدید بیمار: ${userMessage}`;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return `خطا: ${data.error?.message || 'مشکل در ارتباط با Gemini'}`;
    }
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const aiResponse = data.candidates[0].content.parts[0].text;
      session.history.push({ role: 'user', content: userMessage });
      session.history.push({ role: 'assistant', content: aiResponse });
      if (session.history.length > 20) session.history = session.history.slice(-20);
      return aiResponse;
    }
    
    return 'متاسفم، در حال حاضر نمی‌توانم به سوال شما پاسخ دهم.';
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

    if (update.message) {
      const chatId = update.message.chat.id;
      const session = getSession(chatId);
      
      // دریافت عکس
      if (update.message.photo) {
        console.log('Photo received:', JSON.stringify(update.message.photo));
        
        if (!session.visitStarted) {
          await sendMessage(chatId, 'لطفا ابتدا "شروع ویزیت" یا "تحلیل آزمایش" را انتخاب کنید.');
          return res.status(200).json({ ok: true });
        }
        
        await sendMessage(chatId, '⏳ در حال پردازش و تحلیل تصویر...');
        
        try {
          const photo = update.message.photo[update.message.photo.length - 1];
          const fileId = photo.file_id;
          
          console.log('Getting file info for:', fileId);
          
          // دریافت اطلاعات فایل بدون timeout
          const fileResponse = await fetch(`${BALE_API}/getFile?file_id=${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!fileResponse.ok) {
            throw new Error(`خطا در دریافت اطلاعات فایل: ${fileResponse.status}`);
          }
          
          const fileData = await fileResponse.json();
          console.log('File data:', JSON.stringify(fileData));
          
          if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
            throw new Error('اطلاعات فایل معتبر نیست');
          }
          
          const filePath = fileData.result.file_path;
          const fileUrl = `https://tapi.bale.ai/file/bot${BALE_TOKEN}/${filePath}`;
          
          console.log('Downloading image from:', fileUrl);
          
          // دانلود تصویر
          const imageResponse = await fetch(fileUrl);
          
          if (!imageResponse.ok) {
            throw new Error(`خطا در دانلود تصویر: ${imageResponse.status}`);
          }
          
          const arrayBuffer = await imageResponse.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuffer);
          const base64Image = imageBuffer.toString('base64');
          
          console.log('Image downloaded, size:', base64Image.length);
          
          const visionPrompt = session.labTestMode 
            ? 'تو یک دکتر متخصص آزمایشگاه هستی. این تصویر نتایج آزمایش یک بیمار است. لطفا:\n- تمام پارامترهای آزمایش را استخراج کن\n- مقادیر غیرطبیعی را مشخص کن\n- تحلیل کامل و توضیحات ساده ارائه بده\n- توصیه‌های لازم را بده'
            : 'تو یک دکتر متخصص هستی. این تصویر مربوط به یک بیمار است. لطفا تصویر را تحلیل کن و توضیحات پزشکی مفید ارائه بده.';
          
          const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
          
          console.log('Sending to Gemini Vision API...');
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: visionPrompt },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
                ]
              }],
              generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 }
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', errorData);
            throw new Error(`خطای Gemini: ${errorData.error?.message || response.status}`);
          }
          
          const data = await response.json();
          console.log('Gemini response received');
          
          if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const analysis = data.candidates[0].content.parts[0].text;
            await sendMessage(chatId, '🔬 تحلیل تصویر:\n\n' + analysis);
            if (session.labTestMode) session.labTestMode = false;
          } else {
            await sendMessage(chatId, 'متاسفم، نتوانستم تصویر را تحلیل کنم. لطفا دوباره امتحان کنید.');
          }
        } catch (error) {
          console.error('Photo processing error:', error);
          await sendMessage(chatId, `❌ خطا در پردازش تصویر: ${error.message}\n\nلطفا دوباره تلاش کنید.`);
        }
        
        return res.status(200).json({ ok: true });
      }
      
      if (!update.message.text) {
        return res.status(200).json({ ok: true });
      }
      
      const userMessage = update.message.text;

      // دستورات
      if (userMessage === '/start' || userMessage.toLowerCase() === 'شروع ویزیت' || userMessage.toLowerCase() === 'استارت ویزیت') {
        clearSession(chatId);
        const newSession = getSession(chatId);
        newSession.visitStarted = true;
        
        const keyboard = {
          keyboard: [[{ text: 'تحلیل آزمایش' }], [{ text: 'پایان ویزیت' }, { text: 'شروع ویزیت جدید' }]],
          resize_keyboard: true
        };
        
        await sendMessage(chatId, '👨‍⚕️ سلام، من دکتر هوش مصنوعی شما هستم.\n\nلطفا مشکل یا علائم خود را توضیح دهید.\n\n🔬 می‌توانید نتایج آزمایش (عکس یا متن) را برای تحلیل ارسال کنید.\n\n⚠️ توجه: این مشاوره جایگزین ویزیت حضوری نیست.', keyboard);
        
      } else if (userMessage.toLowerCase() === 'تحلیل آزمایش') {
        session.visitStarted = true;
        session.labTestMode = true;
        await sendMessage(chatId, '🔬 لطفا نتایج آزمایش خود را ارسال کنید.\n\nمی‌توانید:\n• عکس آزمایش را ارسال کنید\n• یا نتایج را تایپ کنید');
        
      } else if (userMessage.toLowerCase() === 'پایان ویزیت') {
        clearSession(chatId);
        await sendMessage(chatId, '✅ ویزیت به پایان رسید.\n\nامیدوارم حالتان بهتر شود. 🏥 در صورت تشدید علائم، به پزشک مراجعه کنید.');
        
      } else if (userMessage.toLowerCase() === 'شروع ویزیت جدید') {
        clearSession(chatId);
        const newSession = getSession(chatId);
        newSession.visitStarted = true;
        
        const keyboard = {
          keyboard: [[{ text: 'تحلیل آزمایش' }], [{ text: 'پایان ویزیت' }, { text: 'شروع ویزیت جدید' }]],
          resize_keyboard: true
        };
        
        await sendMessage(chatId, '👨‍⚕️ ویزیت جدید شروع شد.\n\nلطفا مشکل یا علائم خود را توضیح دهید.', keyboard);
        
      } else {
        if (!session.visitStarted) {
          const keyboard = {
            keyboard: [[{ text: 'شروع ویزیت' }, { text: 'تحلیل آزمایش' }]],
            resize_keyboard: true
          };
          await sendMessage(chatId, '👋 سلام! لطفا یکی از گزینه‌ها را انتخاب کنید:\n\n• شروع ویزیت: مشاوره پزشکی\n• تحلیل آزمایش: تحلیل نتایج آزمایش', keyboard);
        } else {
          if (session.labTestMode) {
            const labPrompt = `تو یک دکتر متخصص آزمایشگاه هستی. نتایج آزمایش را تحلیل کن، مقادیر غیرطبیعی را مشخص کن، توضیح ساده بده و توصیه‌های لازم را ارائه کن.\n\nنتایج: ${userMessage}`;

            const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: labPrompt }] }],
                generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 }
              })
            });
            
            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const labAnalysis = data.candidates[0].content.parts[0].text;
              await sendMessage(chatId, '🔬 تحلیل آزمایش:\n\n' + labAnalysis);
              session.labTestMode = false;
            } else {
              await sendMessage(chatId, 'متاسفم، نتوانستم آزمایش را تحلیل کنم');
            }
          } else {
            const geminiResponse = await getGeminiResponse(chatId, userMessage);
            await sendMessage(chatId, geminiResponse);
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ ok: true });
  }
};
