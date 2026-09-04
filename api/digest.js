const { buildDigest } = require('./lib/learning');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const text = body.text || buildDigest(body.games || [], body.learning || null);
    const webhook = body.webhook || process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
      return res.status(200).json({ ok: true, sent: false, text, error: 'No webhook — copy text manually' });
    }
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ ok: false, error: t || 'Discord failed' });
    }
    return res.status(200).json({ ok: true, sent: true, text });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
