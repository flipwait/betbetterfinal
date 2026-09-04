/**
 * Journal learning 71–80 + model health 100 (pure functions; state from client)
 */

function safeNum(x, d = 0) {
  const n = Number(x);
  return isNaN(n) ? d : n;
}

/** bets: [{ rank, league, marketType, won, netEdge, entryPrice, closePrice, lmDir, liqBucket, conf, stake }] */
function analyzeJournal(bets) {
  const list = Array.isArray(bets) ? bets.filter((b) => b.settled) : [];
  const open = Array.isArray(bets) ? bets.filter((b) => !b.settled) : [];

  function bucket(keyFn) {
    const map = {};
    list.forEach((b) => {
      const k = keyFn(b) || 'unknown';
      if (!map[k]) map[k] = { n: 0, wins: 0, pnl: 0, clvSum: 0, clvN: 0 };
      map[k].n += 1;
      if (b.won) map[k].wins += 1;
      const stake = safeNum(b.stake, 1);
      // rough PnL: win => +edge proxy or +1u; use entry as decimal probability
      if (b.won) map[k].pnl += stake * (1 / Math.max(0.05, safeNum(b.entryPrice, 0.5) / (safeNum(b.entryPrice, 50) > 1 ? 100 : 1)) - 1);
      else map[k].pnl -= stake;
      if (b.closePrice != null && b.entryPrice != null) {
        const entry = safeNum(b.entryPrice);
        const close = safeNum(b.closePrice);
        const e = entry > 1 ? entry / 100 : entry;
        const c = close > 1 ? close / 100 : close;
        // CLV: lower entry on yes-side pick is better if we bought — simplified: entry vs close on pick side
        map[k].clvSum += (e - c) * 100; // bought lower than close = positive if prices are yes-prob of our side
        map[k].clvN += 1;
      }
    });
    Object.keys(map).forEach((k) => {
      const m = map[k];
      m.hitRate = m.n ? Math.round((m.wins / m.n) * 1000) / 10 : null;
      m.avgClv = m.clvN ? Math.round((m.clvSum / m.clvN) * 10) / 10 : null;
      m.pnl = Math.round(m.pnl * 100) / 100;
    });
    return map;
  }

  const byRank = bucket((b) => b.rank || 'Pass');
  const byLeague = bucket((b) => (b.league || 'na').toLowerCase());
  const byProp = bucket((b) => b.marketType || b.propType || 'moneyline');
  const byLm = bucket((b) => b.lmDir || 'unknown');
  const byLiq = bucket((b) => b.liqBucket || 'unknown');

  // 76 auto Elite threshold
  let eliteThreshold = 78;
  const elite = byRank.Elite;
  if (elite && elite.n >= 8 && elite.hitRate != null && elite.hitRate < 52) eliteThreshold = 85;
  else if (elite && elite.n >= 5 && elite.hitRate != null && elite.hitRate < 48) eliteThreshold = 88;
  else if (elite && elite.n >= 10 && elite.hitRate != null && elite.hitRate >= 58) eliteThreshold = 74;

  // 77 kill tags
  const killTags = [];
  Object.keys(byProp).forEach((k) => {
    const m = byProp[k];
    if (m.n >= 6 && m.hitRate != null && m.hitRate < 42) killTags.push(k);
  });
  Object.keys(byLeague).forEach((k) => {
    const m = byLeague[k];
    if (m.n >= 8 && m.hitRate != null && m.hitRate < 40) killTags.push('league:' + k);
  });

  // 78 tilt
  const recent = list.slice(-5);
  let losses = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].won) break;
    losses++;
  }
  const tilt = losses >= 4;

  // 79 unit suggestion helper
  function unitFor(bet) {
    let u = 1;
    if (safeNum(bet.conf, 50) >= 70) u = 1.25;
    if (safeNum(bet.conf, 50) < 45) u = 0.5;
    const tag = bet.marketType || 'moneyline';
    if (killTags.indexOf(tag) >= 0) u = 0.25;
    if (tilt) u = Math.min(u, 0.5);
    return u;
  }

  // 80 CLV report
  let clvAll = 0;
  let clvN = 0;
  list.forEach((b) => {
    if (b.closePrice == null || b.entryPrice == null) return;
    const e = safeNum(b.entryPrice);
    const c = safeNum(b.closePrice);
    const ee = e > 1 ? e / 100 : e;
    const cc = c > 1 ? c / 100 : c;
    clvAll += (ee - cc) * 100;
    clvN++;
  });

  const wins = list.filter((b) => b.won).length;
  return {
    settled: list.length,
    open: open.length,
    hitRate: list.length ? Math.round((wins / list.length) * 1000) / 10 : null,
    byRank,
    byLeague,
    byProp,
    byLm,
    byLiq,
    eliteThreshold,
    killTags,
    tilt,
    consecutiveLosses: losses,
    unitFor,
    avgClv: clvN ? Math.round((clvAll / clvN) * 10) / 10 : null,
    clvSamples: clvN,
  };
}

function buildDigest(games, learning) {
  const elite = (games || []).filter((g) => g.rank === 'Elite').slice(0, 5);
  const good = (games || []).filter((g) => g.rank === 'Good').slice(0, 5);
  const live = (games || []).filter((g) => g.live).slice(0, 8);
  const lines = [];
  lines.push('**BetBetter digest**');
  if (learning) {
    lines.push(
      `Journal: ${learning.settled} settled · hit ${learning.hitRate != null ? learning.hitRate + '%' : '—'} · CLV ${learning.avgClv != null ? learning.avgClv + 'pp' : '—'} · Elite≥${learning.eliteThreshold}`
    );
    if (learning.tilt) lines.push('⚠️ Tilt lock: 4+ losses — size down.');
    if (learning.killTags && learning.killTags.length) lines.push('Kill tags: ' + learning.killTags.join(', '));
  }
  lines.push('');
  lines.push('**Elite**');
  if (!elite.length) lines.push('— none —');
  elite.forEach((g) => {
    lines.push(`• ${g.title} → ${g.modelPick} · score ${g.betScore} · EV ${g.netEdge}%`);
  });
  lines.push('');
  lines.push('**Live**');
  if (!live.length) lines.push('— none —');
  live.slice(0, 5).forEach((g) => {
    const b = (g.liveAnalysis && g.liveAnalysis.badges) || [];
    lines.push(`• ${g.title} ${g.period || ''} ${g.score || ''} ${b.slice(0, 2).join(', ')}`);
  });
  return lines.join('\n');
}

module.exports = { analyzeJournal, buildDigest };
