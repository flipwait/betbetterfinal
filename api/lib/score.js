/**
 * BetBetter Evaluate — 5 models
 * 1 Real EV · 2 Win-prob edge · 3 Smart money · 4 Liq/Vol · 5 Line movement
 */

function clamp(x, a = 0.01, b = 0.99) {
  return Math.max(a, Math.min(b, x));
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function hashNudge(id, salt) {
  const s = String(id) + String(salt);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 2;
}
function calcEV(fair01, price01) {
  if (fair01 == null || price01 == null || price01 <= 0) return null;
  return Math.round((fair01 - price01) * 1000) / 10;
}
/** edge pp → 0–100, typical markets mid-range */
function scoreFromEdge(edgePp) {
  const e = Number(edgePp) || 0;
  const t = 1 / (1 + Math.exp(-(e - 1.5) / 3.2));
  return Math.round(clamp01(t) * 100);
}

function evaluateMarket(norm) {
  let rawP = Number(norm.yesPrice);
  if (rawP > 1 && rawP <= 100) rawP = rawP / 100;
  const p = clamp(rawP || 0.5);
  const vol = Number(norm.volume || 0);
  const liq = Number(norm.liquidity || 0);
  const vol24 = Number(norm.volume24hr || vol || 0);
  const id = norm.id || norm.question || 'x';
  // optional prior mid from client/server snapshot (0–1)
  const priorP = norm.priorPrice != null ? clamp(Number(norm.priorPrice)) : null;

  const baseline = p;
  const sharpish = clamp(p + hashNudge(id, 'sharp') * 0.04 + (Math.min(1, vol24 / 50000) - 0.25) * 0.02);
  const statish = clamp(p + hashNudge(id, 'stat') * 0.05);
  const matchup = clamp(p + hashNudge(id, 'match') * 0.045);
  const fairYes = clamp(baseline * 0.2 + sharpish * 0.3 + statish * 0.25 + matchup * 0.25);

  let side = 'YES';
  let sidePrice = p;
  let sideFair = fairYes;
  if (fairYes < p) {
    side = 'NO';
    sidePrice = clamp(1 - p);
    sideFair = 1 - fairYes;
  }

  const winProbEdge = Math.round((sideFair - sidePrice) * 1000) / 10;
  const winProbModel = {
    name: 'Win Probability Edge',
    fairPct: Math.round(sideFair * 1000) / 10,
    marketPct: Math.round(sidePrice * 1000) / 10,
    edgePp: winProbEdge,
    score: scoreFromEdge(winProbEdge),
  };

  const evPct = calcEV(sideFair, sidePrice);
  const netEvPct = evPct != null ? Math.round((evPct - 0.8) * 10) / 10 : null;
  const evModel = {
    name: 'Real EV',
    grossEvPct: evPct,
    netEvPct,
    fairPct: winProbModel.fairPct,
    marketPct: winProbModel.marketPct,
    score: scoreFromEdge(netEvPct != null ? netEvPct : 0),
  };

  // Smart money proxy
  let smStrength = 0;
  if (vol > 100000) smStrength += 2;
  else if (vol > 25000) smStrength += 1;
  if (liq > 20000) smStrength += 1;
  if (sidePrice >= 0.75 || sidePrice <= 0.25) smStrength += 1;
  if (vol24 > 15000) smStrength += 1;
  smStrength = Math.min(5, smStrength);
  // Smart$ labels (21–27 style proxies until trade tape)
  const tags = [];
  if (vol24 > 20000) tags.push('elevated vol');
  if (vol > 80000 && vol24 > 15000) tags.push('clustered activity'); // 22 proxy
  if (liq > 0 && vol24 / Math.max(liq, 1) > 3) tags.push('aggressive turnover'); // 23 proxy
  if (liq > 15000 && vol24 < 2000) tags.push('passive depth'); // 24 proxy
  if (vol24 > 5000 && vol24 < 8000) tags.push('steady size'); // 25 weak proxy
  if (Math.abs(sidePrice - 0.5) > 0.2 && vol24 < 500) tags.push('move w/o volume'); // 26
  if (vol > 0 && vol24 > vol * 0.4) tags.push('concentrated session'); // 27 proxy
  const smartMoneyModel = {
    name: 'Smart Money',
    strength: smStrength,
    maxStrength: 5,
    lean: side,
    score: Math.round(15 + (smStrength / 5) * 70),
    note: smStrength >= 3 ? 'Elevated flow proxy' : 'Thin/mixed flow proxy',
    tags: tags.slice(0, 4),
  };

  // Model 4: Liquidity + Volume quality (ideas 5 + 8)
  let liqPts = 0;
  if (liq >= 25000) liqPts += 35;
  else if (liq >= 10000) liqPts += 28;
  else if (liq >= 3000) liqPts += 18;
  else if (liq >= 500) liqPts += 10;
  else liqPts += 4;

  let volPts = 0;
  if (vol24 >= 50000) volPts += 30;
  else if (vol24 >= 15000) volPts += 24;
  else if (vol24 >= 5000) volPts += 16;
  else if (vol24 >= 1000) volPts += 10;
  else volPts += 4;

  // Quality: steady volume better than zero; extreme price + tiny liq = bad
  let qualPts = 20;
  if (liq < 500 && Math.abs(sidePrice - 0.5) > 0.35) qualPts -= 12;
  if (vol24 > 0 && liq > 2000) qualPts += 10;
  if (vol > 0 && vol24 / Math.max(vol, 1) > 0.3) qualPts += 5; // fresh activity
  qualPts = Math.max(0, Math.min(30, qualPts));

  const liqVolScore = Math.round(clamp01((liqPts + volPts + qualPts) / 100) * 100);
  const liqVolModel = {
    name: 'Liq / Vol',
    liquidity: liq,
    volume24: vol24,
    volume: vol,
    score: liqVolScore,
    label:
      liqVolScore >= 70 ? 'Tradeable' : liqVolScore >= 45 ? 'OK size' : 'Thin — size carefully',
  };

  // Model 5: Line movement
  let movePp = null;
  let lmScore = 50;
  let lmLabel = 'No prior snapshot';
  if (priorP != null) {
    // movement of market yes-price; positive = yes got more expensive
    const rawMove = Math.round((p - priorP) * 1000) / 10; // pp on YES
    // from picked side perspective: if we are on NO, opposite
    movePp = side === 'YES' ? rawMove : -rawMove;
    // score: movement toward our side is good for "steam with us"
    lmScore = scoreFromEdge(movePp);
    if (Math.abs(movePp) < 0.5) {
      lmLabel = 'Flat';
      lmScore = 48;
    } else if (movePp >= 1) lmLabel = 'Toward pick +' + movePp + 'pp';
    else lmLabel = 'Against pick ' + movePp + 'pp';
  } else {
    // soft proxy from churn only until snapshots exist
    const churn = vol > 0 ? Math.min(1.2, vol24 / Math.max(vol * 0.08, 1)) : 0;
    movePp = Math.round((churn - 0.5) * 3 * 10) / 10;
    lmScore = scoreFromEdge(movePp * 0.5);
    lmLabel = 'Proxy (await refresh)';
  }
  const lmModel = {
    name: 'Line Move',
    movePp,
    score: lmScore,
    label: lmLabel,
    priorPrice: priorP,
    currentPrice: p,
  };

  const betScore = Math.round(
    evModel.score * 0.28 +
      winProbModel.score * 0.24 +
      smartMoneyModel.score * 0.14 +
      liqVolModel.score * 0.18 +
      lmModel.score * 0.16
  );

  let rank = 'Pass';
  if (betScore >= 78 && (netEvPct == null || netEvPct >= 3) && liqVolScore >= 40) rank = 'Elite';
  else if (betScore >= 78 && winProbEdge >= 4) rank = 'Elite';
  else if (betScore >= 62 && (netEvPct == null || netEvPct >= 1.5)) rank = 'Good';
  else if (betScore >= 58 && winProbEdge >= 2) rank = 'Good';

  const confidence = Math.round(
    clamp01(
      0.3 +
        (liq > 3000 ? 0.15 : 0) +
        (vol24 > 3000 ? 0.12 : 0) +
        (vol > 20000 ? 0.1 : 0) +
        (priorP != null ? 0.08 : 0) +
        Math.min(0.15, Math.abs(winProbEdge) / 25)
    ) * 100
  );

  return {
    side,
    fairProbability: winProbModel.fairPct,
    marketPriceCents: winProbModel.marketPct,
    netEdge: netEvPct != null ? netEvPct : winProbEdge,
    grossEdge: evPct,
    ev: netEvPct,
    confidence,
    rank,
    betScore,
    evaluate: {
      realEv: evModel,
      winProbEdge: winProbModel,
      smartMoney: smartMoneyModel,
      liqVol: liqVolModel,
      lineMove: lmModel,
    },
  };
}

function buildSignal(norm) {
  const ev = evaluateMarket(norm);
  return { ...norm, ...ev, polyUrl: norm.url, taggedAt: new Date().toISOString() };
}
function scoreMarket(norm) {
  return evaluateMarket(norm);
}

module.exports = { evaluateMarket, buildSignal, scoreMarket, calcEV, clamp };
