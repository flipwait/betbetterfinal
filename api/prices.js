// Ephemeral snapshot store for this lambda instance (91 foundation)
const store = globalThis.__bbPriceStore || (globalThis.__bbPriceStore = {});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const snaps = body.snaps || {};
      const now = Date.now();
      Object.keys(snaps).forEach((id) => {
        if (!store[id]) store[id] = [];
        const p = Number(snaps[id]);
        if (isNaN(p)) return;
        store[id].push({ p, t: now });
        if (store[id].length > 60) store[id] = store[id].slice(-60);
      });
      return res.status(200).json({ ok: true, stored: Object.keys(snaps).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'GET') {
    const id = req.query.id;
    if (id) return res.status(200).json({ ok: true, history: store[id] || [] });
    return res.status(200).json({
      ok: true,
      markets: Object.keys(store).length,
      note: 'Ephemeral per instance — client localStorage is primary for LM',
    });
  }

  return res.status(405).json({ error: 'GET or POST' });
};
