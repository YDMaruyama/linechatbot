
const OpenAI = require('openai');

function pickText(res) {
  if (res && typeof res.output_text === 'string' && res.output_text.trim()) return res.output_text.trim();
  try {
    const c = res?.content?.[0];
    if (typeof c?.text === 'string' && c.text.trim()) return c.text.trim();
    const cc = res?.choices?.[0]?.message?.content;
    if (typeof cc === 'string' && cc.trim()) return cc.trim();
  } catch {}
  return null;
}

async function answerWithGPT(userText, store) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // APIキー未設定時は静かにフォールバック
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const system = [
    "あなたはSALT'NBASE.のLINEアシスタントです。",
    '日本語で300文字以内、丁寧かつ簡潔に回答してください。',
    '不明点は推測せず「店舗に確認」を促してください。',
    '以下の店舗情報を最優先して回答してください。'
  ].join('\n');

  const context = [
    `営業時間: ${store?.hours || '未設定'}`,
    `住所: ${store?.address || '未設定'}`,
    `地図: ${store?.mapUrl || '未設定'}`,
    `メニュー: ${(store?.menu||[]).map(m=>`${m.name}${m.price?`(${m.price})`:''}`).join(', ') || '未設定'}`,
    `キャンペーン: ${(store?.campaigns||[]).map(c=>c.title).join(', ') || '未設定'}`
  ].join('\n');

  try {
    const res = await client.responses.create({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: `ユーザー入力: ${userText}\n\n店舗データ:\n${context}` }
      ]
    });
    const text = pickText(res);
    return text ? [{ type: 'text', text }] : null;
  } catch (e) {
    console.error('GPT error:', e?.message || e);
    return null; // 失敗時はLINEの既定応答にフォールバック
  }
}

module.exports = { answerWithGPT };
cat > lib/gpt.js <<'EOF'
const OpenAI = require('openai');

function pickText(res) {
  if (res && typeof res.output_text === 'string' && res.output_text.trim()) return res.output_text.trim();
  try {
    const c = res?.content?.[0];
    if (typeof c?.text === 'string' && c.text.trim()) return c.text.trim();
    const cc = res?.choices?.[0]?.message?.content;
    if (typeof cc === 'string' && cc.trim()) return cc.trim();
  } catch {}
  return null;
}

async function answerWithGPT(userText, store) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // APIキー未設定時は静かにフォールバック
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  const system = [
    "あなたはSALT'NBASE.のLINEアシスタントです。",
    '日本語で300文字以内、丁寧かつ簡潔に回答してください。',
    '不明点は推測せず「店舗に確認」を促してください。',
    '以下の店舗情報を最優先して回答してください。'
  ].join('\n');

  const context = [
    `営業時間: ${store?.hours || '未設定'}`,
    `住所: ${store?.address || '未設定'}`,
    `地図: ${store?.mapUrl || '未設定'}`,
    `メニュー: ${(store?.menu||[]).map(m=>`${m.name}${m.price?`(${m.price})`:''}`).join(', ') || '未設定'}`,
    `キャンペーン: ${(store?.campaigns||[]).map(c=>c.title).join(', ') || '未設定'}`
  ].join('\n');

  try {
    const res = await client.responses.create({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: `ユーザー入力: ${userText}\n\n店舗データ:\n${context}` }
      ]
    });
	    const text = pickText(res);
    return text ? [{ type: 'text', text }] : null;
  } catch (e) {
    console.error('GPT error:', e?.message || e);
    return null; // 失敗時はLINEの既定応答にフォールバック
  }
}

module.exports = { answerWithGPT };
EOF

