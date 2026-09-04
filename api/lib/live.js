/**
 * Live focus helpers — ideas 41–48
 */

function parsePeriodPhase(league, period, live) {
  if (!live) return { phase: 'pre', phaseLabel: 'Pre-game', timeFactor: 1, almostDone: false };
  const p = String(period || '').toUpperCase();
  const L = (league || '').toLowerCase();

  if (L === 'mlb') {
    const m = p.match(/(\d+)/);
    const inn = m ? parseInt(m[1], 10) : 1;
    const late = inn >= 7;
    const mid = inn >= 4 && inn <= 6;
    return {
      phase: late ? 'late' : mid ? 'mid' : 'early',
      phaseLabel: (p || 'Live') + (late ? ' · late' : mid ? ' · mid' : ' · early'),
      timeFactor: late ? 0.35 : mid ? 0.65 : 0.9,
      almostDone: inn >= 9,
      inning: inn,
      f5Relevant: inn < 5,
    };
  }
  if (L === 'nfl' || L === 'cfb') {
    if (/Q4|4TH|OT/.test(p)) return { phase: 'late', phaseLabel: p + ' · late', timeFactor: 0.3, almostDone: /Q4|4TH/.test(p), f5Relevant: false };
    if (/Q3|3RD/.test(p)) return { phase: 'mid', phaseLabel: p + ' · mid', timeFactor: 0.55, almostDone: false, f5Relevant: false };
    if (/Q2|2ND|HALF/.test(p)) return { phase: 'mid', phaseLabel: p || 'Q2', timeFactor: 0.7, almostDone: false, f5Relevant: false };
    return { phase: 'early', phaseLabel: p || 'Live', timeFactor: 0.9, almostDone: false, f5Relevant: false };
  }
  if (L === 'nba' || L === 'wnba' || L === 'cbb') {
    if (/Q4|4TH|OT/.test(p)) return { phase: 'late', phaseLabel: p + ' · late', timeFactor: 0.3, almostDone: true, f5Relevant: false };
    if (/Q3|3RD/.test(p)) return { phase: 'mid', phaseLabel: p + ' · mid', timeFactor: 0.55, almostDone: false, f5Relevant: false };
    return { phase: 'early', phaseLabel: p || 'Live', timeFactor: 0.85, almostDone: false, f5Relevant: false };
  }
  return { phase: 'live', phaseLabel: p || 'Live', timeFactor: 0.7, almostDone: false, f5Relevant: false };
}

function parseScoreDiff(score) {
  if (!score || typeof score !== 'string') return { diff: null, totalRuns: null };
  // formats: "4-3", "5-7, 4-4", "12-10"
  const parts = score.match(/(\d+)\s*[-–]\s*(\d+)/g);
  if (!parts || !parts.length) return { diff: null, totalRuns: null };
  const last = parts[parts.length - 1].match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!last) return { diff: null, totalRuns: null };
  const a = parseInt(last[1], 10);
  const b = parseInt(last[2], 10);
  return { diff: Math.abs(a - b), totalRuns: a + b, home: b, away: a };
}

/**
 * Build live analysis object for focus UI
 */
function buildLiveAnalysis(game) {
  const live = !!game.live;
  const phase = parsePeriodPhase(game.league, game.period, live);
  const sc = parseScoreDiff(game.score);
  const liq = Number(game.liquidity || 0);
  const betScore = Number(game.betScore || 0);
  const implied = Number(game.impliedPct != null ? game.impliedPct : game.marketPriceCents);
  const netEdge = Number(game.netEdge || 0);

  const badges = [];
  const tips = [];

  if (!live) {
    return {
      live: false,
      phase,
      score: sc,
      badges: ['Pre-game'],
      tips: ['Live focus is strongest after first pitch/tip — pin this game when it goes live.'],
      liveScoreAdjust: 0,
      trapRisk: false,
      liqCrush: liq > 0 && liq < 800,
    };
  }

  // 41 time remaining / phase
  if (phase.almostDone) {
    badges.push('Almost done');
    tips.push('Little variance left — only take live bets with clear edge and real liquidity.');
  } else if (phase.phase === 'late') {
    badges.push('Late phase');
    tips.push('Late game: clock/outs matter more than pre-game model fair.');
  } else if (phase.phase === 'early') {
    badges.push('Early');
    tips.push('Still early — full-game models remain relevant.');
  }

  // 42 score differential
  if (sc.diff != null) {
    if (sc.diff >= 7 && (game.league === 'nfl' || game.league === 'cfb')) {
      badges.push('Large lead');
      tips.push('Large lead: ML favorites often overpriced (clock, not football).');
    }
    if (sc.diff >= 5 && (game.league === 'nba' || game.league === 'wnba')) {
      badges.push('Big margin');
      tips.push('Large margin live — favorite ML can be a low-upside trap.');
    }
    if (sc.diff >= 4 && game.league === 'mlb' && phase.inning >= 7) {
      badges.push('MLB late margin');
      tips.push('Late innings with a multi-run lead: underdogs need a lot of variance.');
    }
  }

  // 43 phase / F5
  if (phase.f5Relevant === false && game.marketType === 'f5') {
    badges.push('F5 window closed');
    tips.push('First-5 style markets are often decided or locked after mid-game.');
  }

  // 44 live total context
  if (sc.totalRuns != null && /total|over|under/i.test(String(game.title || '') + String(game.marketType || ''))) {
    tips.push('Live total: score is already ' + sc.totalRuns + ' combined — compare to the line still offered.');
    badges.push('Total vs score');
  }

  // 47 late ML trap
  let trapRisk = false;
  if (implied != null && implied >= 88 && phase.phase === 'late') {
    trapRisk = true;
    badges.push('Late ML trap risk');
    tips.push('Heavy favorite price late = little upside, real downside if it tightens.');
  }
  if (implied != null && implied >= 92) {
    trapRisk = true;
    badges.push('Tiny upside');
    tips.push('Price above ~92¢ leaves almost no room after fees.');
  }

  // 48 live liquidity crush
  const liqCrush = liq > 0 && liq < 1200;
  if (liqCrush) {
    badges.push('Thin live liq');
    tips.push('Live liquidity is thin — edge on screen may not be fillable.');
  }

  // 46 stoppage — can't detect reliably; generic tip when late
  if (phase.phase === 'late') {
    tips.push('If play is under review/timeout, wait for the next clean pitch/snap before chasing.');
  }

  // Score adjust for sorting: penalize traps and almost-done
  let liveScoreAdjust = 0;
  liveScoreAdjust -= (1 - phase.timeFactor) * 15;
  if (trapRisk) liveScoreAdjust -= 20;
  if (liqCrush) liveScoreAdjust -= 12;
  if (phase.almostDone) liveScoreAdjust -= 10;
  if (netEdge >= 3 && !trapRisk && !liqCrush) liveScoreAdjust += 8;

  return {
    live: true,
    phase,
    score: sc,
    badges: badges.slice(0, 6),
    tips: tips.slice(0, 6),
    liveScoreAdjust: Math.round(liveScoreAdjust),
    trapRisk,
    liqCrush,
    actionableScore: Math.round(betScore + liveScoreAdjust),
  };
}

module.exports = { parsePeriodPhase, parseScoreDiff, buildLiveAnalysis };
