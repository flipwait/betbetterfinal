module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { prompt, model = 'gpt-4o', context } = body;
  if (!prompt && !context) return res.status(400).json({ error: 'prompt or context required' });

  const system = `You are a sharp sports betting analyst for Polymarket US prediction markets.
Always structure your answer with these sections:

1) VERDICT: TAKE or PASS (one line) + preferred side/team
2) MATCHUP SNAPSHOT: how these teams/players typically play (pace, style, strengths/weaknesses)
3) RECENT FORM / H2H: use last ~10 meetings or recent form if you know it; if unknown, say what data is missing and use general tendencies
4) KEY DATA: 4–8 bullet reasons this is +EV or not (price vs fair, injuries if relevant, rest, totals environment)
5) FIVE MINI-SIMULATIONS: 5 short scenarios (both teams/sides). For each: scenario name, likely score/path, which bet side benefits
6) RISK / DEVIL'S ADVOCATE: why the bet fails
7) FINAL PICK: clear recommendation and confidence 1–10

Be concise but specific. No generic filler. If live score/period is provided, factor time remaining and current state heavily.`;

  const userContent =
    (context
      ? `Market context (JSON):\n${typeof context === 'string' ? context : JSON.stringify(context, null, 2)}\n\n`
      : '') + (prompt || 'Analyze this market.');

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.35,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'OpenAI error' });
    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content, model });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
