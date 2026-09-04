/**
 * Book consensus quality 64–69
 */

function americanToImplied(am) {
  const n = Number(am);
  if (!n || isNaN(n)) return null;
  if (n > 0) return Math.round((100 / (n + 100)) * 1000) / 10;
  return Math.round((-n / (-n + 100)) * 1000) / 10;
}

function median(arr) {
  const a = arr.filter((x) => x != null && !isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * consensus outcomes: [{ name, prices: number[] american }]
 * pmImpliedPct: number 0-100 for picked side name match optional
 */
function qualityConsensus(h2hByName, pmImpliedPct) {
  // h2hByName: { 'Team A': [+130, +125, +140], ... }
  const names = Object.keys(h2hByName || {});
  const cleaned = {};
  names.forEach((name) => {
    let prices = (h2hByName[name] || []).map(Number).filter((x) => !isNaN(x));
    // 64 outlier removal: drop min/max if >= 4 books
    if (prices.length >= 4) {
      prices = prices.slice().sort((a, b) => a - b);
      prices = prices.slice(1, prices.length - 1);
    }
    const med = median(prices);
    const avg = prices.length ? prices.reduce((s, x) => s + x, 0) / prices.length : null;
    cleaned[name] = {
      name,
      books: (h2hByName[name] || []).length,
      medianAmerican: med != null ? Math.round(med) : null,
      avgAmerican: avg != null ? Math.round(avg) : null,
      impliedPct: americanToImplied(med != null ? med : avg),
    };
  });

  // 65 PM premium/discount vs median book implied for closest name
  let pmPremium = null;
  let softSide = null;
  if (pmImpliedPct != null) {
    const imps = Object.values(cleaned)
      .map((c) => c.impliedPct)
      .filter((x) => x != null);
    const bookMed = median(imps);
    if (bookMed != null) {
      pmPremium = Math.round((pmImpliedPct - bookMed) * 10) / 10;
      softSide = pmPremium <= -2 ? 'PM soft vs books' : pmPremium >= 3 ? 'PM rich vs books' : 'PM ≈ books';
    }
  }

  return {
    outcomes: Object.values(cleaned),
    pmPremiumPp: pmPremium,
    softLabel: softSide,
    region: 'us',
    notes: ['Outliers trimmed when ≥4 books', 'US region preferred'],
  };
}

module.exports = { qualityConsensus, americanToImplied, median };
