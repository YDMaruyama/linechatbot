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
// api/webhook.js
const crypto = require('node:crypto');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).send('OK');
    }
    if (req.method !== 'POST') {
      return res.setHeader('Allow', 'GET, POST').status(405).end();
    }

    // raw body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const rawBody = Buffer.concat(chunks);

    // （任意）署名検証
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (secret) {
      const sig = req.headers['x-line-signature'];
      if (!sig) return res.status(400).send('Missing signature');
      const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
      if (sig !== hmac) return res.status(401).send('Invalid signature');
    }

    // JSON パース
    let body = {};
    if (rawBody.length) {
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).send('Invalid JSON');
      }
    }

    // TODO: body.events の処理
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal Server Error');
  }
};
