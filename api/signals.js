const { fetchAllSportsEvents, flattenMarkets } = require('./lib/polymarket');
const { buildSignal } = require('./lib/score');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const minEdge = parseFloat(req.query.minEdge || '0');
    const rankFilter = (req.query.rank || '').toLowerCase();
    const mode = (req.query.mode || 'all').toLowerCase(); // all | live | upcoming
    const league = (req.query.league || '').toLowerCase();

    let events = await fetchAllSportsEvents({ limitPerLeague: 15 });

    if (mode === 'live') events = events.filter((e) => e.live && !e.ended);
    if (mode === 'upcoming') events = events.filter((e) => !e.live && !e.ended);

    if (league) events = events.filter((e) => e.league === league);

    let markets = flattenMarkets(events).filter((m) => m.yesPrice != null && !m.closed);

    let signals = markets.map((m) => {
      const scored = buildSignal({
        id: m.id,
        question: m.question,
        slug: m.slug,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        volume: m.volume,
        liquidity: m.liquidity,
        volume24hr: m.volume,
        url: m.url,
      });
      return Object.assign({}, scored, {
        league: m.league,
        eventTitle: m.eventTitle,
        live: m.live,
        period: m.period,
        score: m.score,
        startTime: m.startTime,
        sportsMarketType: m.sportsMarketType,
        polyUrl: m.url,
      });
    });

    if (minEdge > 0) signals = signals.filter((s) => Math.abs(s.netEdge) >= minEdge);
    if (rankFilter === 'elite') signals = signals.filter((s) => s.rank === 'Elite');
    if (rankFilter === 'good') signals = signals.filter((s) => s.rank === 'Good');
    if (rankFilter === 'pass') signals = signals.filter((s) => s.rank === 'Pass');

    signals.sort((a, b) => {
      const order = { Elite: 0, Good: 1, Pass: 2 };
      if (order[a.rank] !== order[b.rank]) return order[a.rank] - order[b.rank];
      return b.netEdge - a.netEdge;
    });

    const summary = {
      total: signals.length,
      elite: signals.filter((s) => s.rank === 'Elite').length,
      good: signals.filter((s) => s.rank === 'Good').length,
      pass: signals.filter((s) => s.rank === 'Pass').length,
      liveEvents: events.filter((e) => e.live).length,
      upcomingEvents: events.filter((e) => !e.live && !e.ended).length,
    };

    return res.status(200).json({
      ok: true,
      source: 'gateway.polymarket.us',
      sportsOnly: true,
      leagues: ['nba','wnba','ufc','mlb','cfb','cbb','nfl','atp','wta'],
      updatedAt: new Date().toISOString(),
      summary,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        league: e.league,
        live: e.live,
        period: e.period,
        score: e.score,
        startTime: e.startTime,
        url: e.url,
        marketCount: (e.markets || []).length,
      })),
      signals: signals.slice(0, 60),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
