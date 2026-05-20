const fetch = require('node-fetch');

const BALE_TOKEN = process.env.BALE_TOKEN;
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userMessage = update.message.text;

      await sendMessage(chatId, userMessage);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ ok: true });
  }
};
