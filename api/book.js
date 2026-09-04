/**
 * GET /api/book?slug=market-slug
 * Public Polymarket US order book via gateway (no key required).
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ ok: false, error: 'slug required' });

  try {
    const r = await fetch(
      'https://gateway.polymarket.us/v1/markets/' + encodeURIComponent(slug) + '/book',
      { headers: { Accept: 'application/json' } }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data.message || 'book fetch failed', detail: data });
    }

    const md = data.marketData || data;
    const bids = md.bids || [];
    const offers = md.offers || [];
    const bidQty = bids.reduce((a, b) => a + parseFloat(b.qty || 0), 0);
    const askQty = offers.reduce((a, b) => a + parseFloat(b.qty || 0), 0);
    const imbalance =
      bidQty + askQty > 0 ? Math.round(((bidQty - askQty) / (bidQty + askQty)) * 1000) / 10 : 0;

    return res.status(200).json({
      ok: true,
      source: 'gateway.polymarket.us',
      slug,
      imbalancePct: imbalance,
      bidQty,
      askQty,
      lastTradePx: md.stats && md.stats.lastTradePx,
      sharesTraded: md.stats && md.stats.sharesTraded,
      book: { bids: bids.slice(0, 5), offers: offers.slice(0, 5) },
      rawStats: md.stats || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
