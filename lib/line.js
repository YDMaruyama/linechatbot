const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../data/store.json');
let STORE = { faq: [], hours: '', address: '', mapUrl: '' };
try {
  const raw = fs.readFileSync(storePath, 'utf8');
  STORE = JSON.parse(raw);
} catch (e) {
  console.warn('store.json の読み込みに失敗しました（初期値を使用）', e?.message);
}

/** 署名生成（Base64） */
function sign(rawBody, channelSecret) {
  return crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
}

/** 署名検証（タイミング攻撃対策あり） */
function verifySignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = sign(rawBody, channelSecret);
  try {
    const a = Buffer.from(signature, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** テキストメッセージを生成 */
const text = (t) => ({ type: 'text', text: t });

/** リプライ送信 */
async function replyMessage(replyToken, messages, channelAccessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('LINE reply error:', res.status, body);
    throw new Error(`LINE reply failed: ${res.status}`);
  }
}

/** プッシュ送信（必要に応じて使用） */
async function pushMessage(to, messages, channelAccessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('LINE push error:', res.status, body);
    throw new Error(`LINE push failed: ${res.status}`);
  }
}

/** 簡易FAQ検索（完全一致/部分一致） */
function findFaq(textInput) {
  if (!textInput || !STORE.faq) return null;
  // 完全一致優先
  const exact = STORE.faq.find((f) => f.q === textInput);
  if (exact) return exact.a;
  // 部分一致
  const partial = STORE.faq.find((f) => textInput.includes(f.q) || f.q.includes(textInput));
  return partial ? partial.a : null;
}

/** イベントごとの応答定義（最低限・カスタマイズ可） */
async function handleEvent(event) {
  // フォロー（友だち追加）
  if (event.type === 'follow') {
    return [
      text('友だち追加ありがとうございます！\nご質問があれば気軽にメッセージしてください。'),
      {
        type: 'text',
        text: 'よくある質問：\n・営業時間\n・アクセス\n・メニュー\nなどと送ると、すぐにご案内します。',
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '営業時間', text: '営業時間' } },
            { type: 'action', action: { type: 'message', label: 'アクセス', text: 'アクセス' } },
            { type: 'action', action: { type: 'message', label: 'メニュー', text: 'メニュー' } },
          ],
        },
      },
    ];
  }

  // メッセージ（テキストのみ対応）
  if (event.type === 'message' && event.message?.type === 'text') {
    const userText = (event.message.text || '').trim();

    // 簡易コマンド
    if (userText.toLowerCase() === 'ping') return [text('pong')];

    // よくある質問
    if (userText.includes('営業時間')) {
      return [text(`本日の営業時間：${STORE.hours}\n詳細はお問い合わせください。`)];
    }
    if (userText.includes('アクセス')) {
      const addr = STORE.address ? `住所：${STORE.address}` : '';
      const map = STORE.mapUrl ? `\n地図：${STORE.mapUrl}` : '';
      return [text(`アクセスのご案内\n${addr}${map}`.trim())];
    }

    // FAQ辞書でヒット
    const faqAnswer = findFaq(userText);
    if (faqAnswer) return [text(faqAnswer)];

    // 既定（エコー＋クイックリプライ）
    return [
      text(`「${userText}」について、少し詳しく教えていただけますか？`),
      {
        type: 'text',
        text: '以下から選べます👇',
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '営業時間', text: '営業時間' } },
            { type: 'action', action: { type: 'message', label: 'アクセス', text: 'アクセス' } },
            { type: 'action', action: { type: 'message', label: 'メニュー', text: 'メニュー' } },
            { type: 'action', action: { type: 'message', label: 'ping', text: 'ping' } },
          ],
        },
      },
    ];
  }

  // それ以外は無応答
  return [];
}

module.exports = {
  verifySignature,
  replyMessage,
  pushMessage,
  handleEvent,
  text,
};
