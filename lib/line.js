const crypto = require('crypto');
const { getStore, loadStoreFromSheets } = require('./sheets');
const { answerWithGPT } = require('./gpt');
const fetch = global.fetch; // Node 20+

/** 署名生成（Base64） */
function sign(rawBody, channelSecret) {
  return crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
}

/** 署名検証 */
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

/** テキストメッセージ */
const text = (t, quickReply) => quickReply ? ({ type: 'text', text: t, quickReply }) : ({ type: 'text', text: t });

/** リプライ送信 */
async function replyMessage(replyToken, messages, channelAccessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('LINE reply error:', res.status, body);
    throw new Error(`LINE reply failed: ${res.status}`);
  }
}

/** プッシュ送信（必要に応じて） */
async function pushMessage(to, messages, channelAccessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('LINE push error:', res.status, body);
    throw new Error(`LINE push failed: ${res.status}`);
  }
}

/** FAQ検索 */
function findFaq(textInput, store) {
  if (!textInput || !store?.faq) return null;
  const exact = store.faq.find((f) => f.q === textInput);
  if (exact) return exact.a;
  const partial = store.faq.find((f) => textInput.includes(f.q) || f.q.includes(textInput));
  return partial ? partial.a : null;
}

/** 既定のQuick Reply */
function defaultQuickReply(store) {
  return {
    items: [
      { type: 'action', action: { type: 'message', label: '予約', text: '予約' } },
      { type: 'action', action: { type: 'message', label: 'メニュー', text: 'メニュー' } },
      { type: 'action', action: { type: 'message', label: 'キャンペーン', text: 'キャンペーン' } },
      { type: 'action', action: { type: 'message', label: 'アクセス', text: 'アクセス' } },
    ],
  };
}

/** イベント処理 */
async function handleEvent(event) {
  const store = await getStore();

  if (event.type === 'follow') {
    return [ text('友だち追加ありがとうございます！ご用件をお選びください👇', defaultQuickReply(store)) ];
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    const userText = (event.message.text || '').trim();

    // 手動リロード
    if (userText === 'リロード') {
      await loadStoreFromSheets();
      return [text('最新データに更新しました。', defaultQuickReply(store))];
    }

    if (userText.toLowerCase() === 'ping') return [text('pong', defaultQuickReply(store))];

    if (userText.includes('営業時間')) {
      return [text(`本日の営業時間：${store.hours || '未設定'}\n詳細はお問い合わせください。`, defaultQuickReply(store))];
    }

    if (userText.includes('アクセス')) {
      const addr = store.address ? `住所：${store.address}` : '';
      const map = store.mapUrl ? `\n地図：${store.mapUrl}` : '';
      return [text(`アクセスのご案内\n${addr}${map}`.trim(), defaultQuickReply(store))];
    }

    if (userText.includes('予約')) {
      const url = store.bookingUrl || '';
      const base = url ? `オンライン予約はこちら：${url}` : 'ご希望の日時（第1希望/第2希望）と人数を送ってください。空き状況をご案内します。';
      const qr = {
        items: [
          ...(url ? [{ type: 'action', action: { type: 'uri', label: '予約ページを開く', uri: url } }] : []),
          { type: 'action', action: { type: 'message', label: 'メニュー', text: 'メニュー' } },
          { type: 'action', action: { type: 'message', label: '営業時間', text: '営業時間' } },
        ],
      };
      return [text(base, qr)];
    }

    if (userText.includes('メニュー')) {
      const list = (store.menu || [])
        .slice(0, 10)
        .map((m) => `・${m.name}${m.price ? `（${m.price}）` : ''}${m.desc ? `\n　${m.desc}` : ''}`)
        .join('\n');
      return [text(`メニューの一部をご案内します\n${list || '準備中です。'}`, defaultQuickReply(store))];
    }

    if (userText.includes('キャンペーン')) {
      const list = (store.campaigns || [])
        .slice(0, 3)
        .map((c) => `・${c.title}${c.start ? `（${c.start}${c.end ? `〜${c.end}` : ''}）` : ''}${c.details ? `\n　${c.details}` : ''}`)
        .join('\n');
      return [text(`実施中のキャンペーン\n${list || '現在実施中のキャンペーンはありません。'}`, defaultQuickReply(store))];
    }

    // FAQ
    const faqAnswer = findFaq(userText, store);
    if (faqAnswer) return [text(faqAnswer, defaultQuickReply(store))];

    // GPT（最後の砦）
    const gpt = await answerWithGPT(userText, store);
    if (gpt) return gpt;

    // 既定
    return [ text(`「${userText}」について、少し詳しく教えていただけますか？`, defaultQuickReply(store)) ];
  }

  return [];
}

module.exports = { verifySignature, replyMessage, pushMessage, handleEvent, text };
