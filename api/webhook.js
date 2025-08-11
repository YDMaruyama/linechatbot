// Vercel用のサーバレス関数（/api/webhook）
// 署名検証→イベント処理→返信 までを行います。
require('dotenv').config();
const crypto = require('crypto');
const { verifySignature, replyMessage, handleEvent } = require('../lib/line');

// 生のボディを読み取る（VercelのNode関数は自前で読み取るのが安全）
const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-line-signature'];
    const secret = process.env.LINE_CHANNEL_SECRET;

    if (!verifySignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const events = body.events || [];
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    // 各イベントに返信（replyTokenはイベントごとに1回のみ有効）
    await Promise.all(
      events.map(async (event) => {
        const messages = await handleEvent(event);
        if (event.replyToken && messages && messages.length > 0) {
          await replyMessage(event.replyToken, messages, token);
        }
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
