// lib/gpt.js  （CommonJS版・重複宣言なし）
let __openaiClient;

/**
 * OpenAI SDK を CJS から安全に読み込む（v4はESM優先なので動的import）
 */
async function getOpenAI() {
  if (__openaiClient) return __openaiClient;
  const { default: OpenAI } = await import('openai');
  __openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return __openaiClient;
}

/**
 * 例: シンプルなチャット呼び出し
 */
async function chat(prompt) {
  const client = await getOpenAI();
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
  });
  return resp.choices?.[0]?.message?.content ?? '';
}

module.exports = { getOpenAI, chat };

