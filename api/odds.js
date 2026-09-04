/**
 * GET /api/odds?league=mlb|nfl|nba|...
 * ODDS_API_KEY env or ?apiKey= for testing
 */
const { qualityConsensus } = require('./lib/books');

const SPORT_MAP = {
  mlb: 'baseball_mlb',
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  wnba: 'basketball_wnba',
  cfb: 'americanfootball_ncaaf',
  cbb: 'basketball_ncaab',
  ufc: 'mma_mixed_martial_arts',
  atp: 'tennis_atp_french_open',
  wta: 'tennis_wta_french_open',
};

function americanToImplied(am) {
  const n = Number(am);
  if (!n || isNaN(n)) return null;
  if (n > 0) return Math.round((100 / (n + 100)) * 1000) / 10;
  return Math.round((-n / (-n + 100)) * 1000) / 10;
}

function avg(nums) {
  const a = nums.filter((x) => x != null && !isNaN(x));
  if (!a.length) return null;
  return Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const apiKey = process.env.ODDS_API_KEY || req.query.apiKey || '';
  if (!apiKey) {
    return res.status(400).json({
      ok: false,
      error: 'Missing ODDS_API_KEY. Add key in Vercel env or Settings, then Save + Test Odds API.',
    });
  }

  const league = (req.query.league || req.query.sport || 'mlb').toLowerCase() || 'mlb';
  const sportKey = SPORT_MAP[league] || req.query.sportKey || 'baseball_mlb';
  const markets = req.query.markets || 'h2h';
  const regions = req.query.regions || 'us';

  try {
    const url =
      'https://api.the-odds-api.com/v4/sports/' +
      encodeURIComponent(sportKey) +
      '/odds?apiKey=' +
      encodeURIComponent(apiKey) +
      '&regions=' +
      encodeURIComponent(regions) +
      '&markets=' +
      encodeURIComponent(markets) +
      '&oddsFormat=american';

    const r = await fetch(url);
    const remaining = r.headers.get('x-requests-remaining');
    const used = r.headers.get('x-requests-used');
    let data;
    try {
      data = await r.json();
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Odds API returned non-JSON' });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        error: (data && (data.message || data.error_code)) || 'Odds API error',
        detail: data,
      });
    }

    const games = (Array.isArray(data) ? data : []).map((g) => {
      const books = g.bookmakers || [];
      const byName = {};
      books.forEach((b) => {
        const m = (b.markets || []).find((x) => x.key === 'h2h');
        if (!m) return;
        (m.outcomes || []).forEach((o) => {
          if (!byName[o.name]) byName[o.name] = [];
          byName[o.name].push(o.price);
        });
      });
      const q = qualityConsensus(byName, null);
      const consensus = (q.outcomes || []).map((c) => ({
        name: c.name,
        avgAmerican: c.avgAmerican,
        medianAmerican: c.medianAmerican,
        impliedPct: c.impliedPct,
        books: c.books,
      }));
      const quality = { pmPremiumPp: q.pmPremiumPp, softLabel: q.softLabel, notes: q.notes };
      const h2hSample = [];
      books.slice(0, 4).forEach((b) => {
        const m = (b.markets || []).find((x) => x.key === 'h2h');
        if (!m) return;
        (m.outcomes || []).forEach((o) => {
          h2hSample.push({ book: b.title, name: o.name, price: o.price });
        });
      });
      return {
        id: g.id,
        sportKey: g.sport_key,
        home: g.home_team,
        away: g.away_team,
        commence: g.commence_time,
        bookmakers: books.length,
        consensus,
        h2hSample: h2hSample.slice(0, 12),
        quality,
      };
    });

    return res.status(200).json({
      ok: true,
      source: 'the-odds-api',
      sportKey,
      league,
      remaining: remaining != null ? Number(remaining) : null,
      used: used != null ? Number(used) : null,
      count: games.length,
      games,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
