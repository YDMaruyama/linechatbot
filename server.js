// ローカル開発用（Express）: ngrok等で /webhook を公開してLINEに登録します。
require('dotenv').config();
const express = require('express');
const { verifySignature, replyMessage, handleEvent } = require('./lib/line');

const app = express();

// 署名検証のため "raw" で受け取る（とても重要）
app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    const secret = process.env.LINE_CHANNEL_SECRET;

    if (!verifySignature(req.body, signature, secret)) {
      return res.status(401).send('Invalid signature');
    }

    const body = JSON.parse(req.body.toString('utf8'));
    const events = body.events || [];
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    await Promise.all(
      events.map(async (event) => {
        const messages = await handleEvent(event);
        if (event.replyToken && messages && messages.length > 0) {
          await replyMessage(event.replyToken, messages, token);
        }
      })
    );

    res.status(200).send('OK');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

app.get('/', (_req, res) => res.send('LINE Bot dev server running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dev server listening on http://localhost:${PORT}`);
});
