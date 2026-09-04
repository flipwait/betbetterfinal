const { fetchAllSportsEvents, LEAGUES } = require('./lib/polymarket');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const mode = (req.query.mode || 'all').toLowerCase();
    const league = (req.query.league || '').toLowerCase();
    let events = await fetchAllSportsEvents({ limitPerLeague: 20 });
    if (mode === 'live') events = events.filter((e) => e.live && !e.ended);
    if (mode === 'upcoming') events = events.filter((e) => !e.live && !e.ended);
    if (league) events = events.filter((e) => e.league === league);

    return res.status(200).json({
      ok: true,
      source: 'gateway.polymarket.us',
      leagues: LEAGUES,
      updatedAt: new Date().toISOString(),
      count: events.length,
      events,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
