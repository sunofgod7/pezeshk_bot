const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const BALE_TOKEN = process.env.BALE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BALE_API = `https://tapi.bale.ai/bot${BALE_TOKEN}`;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

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
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'متاسفم، در حال حاضر نمی‌توانم به سوال شما پاسخ دهم. لطفا دوباره تلاش کنید.';
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
