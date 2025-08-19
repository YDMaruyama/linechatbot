const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  // 1行(\n入り)でも複数行でもOK
  const key = keyRaw.includes('\\n') ? keyRaw.replace(/\\n/g, '\n') : keyRaw;
  if (!email || !key) throw new Error('Missing Google service account env');
  return new google.auth.JWT(email, null, key, SCOPES);
}

async function fetchValues(range) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function loadStoreFromSheets() {
  const [settings, faq, menu, campaigns] = await Promise.all([
    fetchValues('Settings!A1:B20'),
    fetchValues('FAQ!A:B'),
    fetchValues('Menu!A:C'),
    fetchValues('Campaigns!A:D'),
  ]);

  const settingsMap = Object.fromEntries((settings || []).filter(r=>r[0]).map(r=>[r[0], r[1] || '']));
  const hours = settingsMap['Hours'] || '';
  const address = settingsMap['Address'] || '';
  const mapUrl = settingsMap['MapUrl'] || '';
  const bookingUrl = settingsMap['BookingUrl'] || '';

  const faqList = (faq || []).filter(r=>r[0] && r[1]).map(([q,a])=>({ q, a }));
  const menuList = (menu || []).filter(r=>r[0]).map(([name, desc='', price=''])=>({ name, desc, price }));
  const campaignList = (campaigns || []).filter(r=>r[0]).map(([title, details='', start='', end=''])=>({ title, details, start, end }));

  return { hours, address, mapUrl, bookingUrl, faq: faqList, menu: menuList, campaigns: campaignList, source: 'sheets' };
}

let CACHE = null;
let EXPIRES = 0;
const TTL = Number(process.env.SHEETS_CACHE_MS || 300000); // 5分

async function getStore() {
  const now = Date.now();
  if (CACHE && now < EXPIRES) return CACHE;
  try {
    CACHE = await loadStoreFromSheets();
    EXPIRES = now + TTL;
    return CACHE;
  } catch (e) {
    console.error('Sheets load failed:', e?.message);
    try {
      const raw = fs.readFileSync(path.join(__dirname, '../data/store.json'), 'utf8');
      CACHE = JSON.parse(raw);
      return CACHE;
    } catch {
      return { faq: [], hours: '', address: '', mapUrl: '', bookingUrl: '' };
    }
  }
}

module.exports = { getStore, loadStoreFromSheets };
