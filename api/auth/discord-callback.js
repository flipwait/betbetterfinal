/**
 * GET /api/auth/discord-callback?code=...
 */
module.exports = async function handler(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send('Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET');
    return;
  }

  if (req.query.error) {
    res.writeHead(302, { Location: '/?auth=error' });
    res.end();
    return;
  }

  const code = req.query.code;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = proto + '://' + host + '/api/auth/discord-callback';

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      res.status(400).send(
        'Token exchange failed: ' + (tokenData.error_description || tokenData.error || 'unknown')
      );
      return;
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const user = await userRes.json();
    if (!userRes.ok || !user.id) {
      res.status(400).send('Failed to load Discord user');
      return;
    }

    const username = user.global_name || user.username || 'DiscordUser';
    const avatar = user.avatar
      ? 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png'
      : '';
    const payload = {
      username: username,
      discordId: user.id,
      avatar: avatar,
      email: user.email || null,
      provider: 'discord',
      at: Date.now(),
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Signing in…</title></head>' +
        '<body style="background:#0a0c10;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
        '<p>Signed in with Discord — redirecting…</p><script>try{var session=' +
        json +
        ';localStorage.setItem("betbetter_session",JSON.stringify(session));var key="betbetter_stats_"+(session.discordId||session.username);if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify({bets:0,wins:0,pnl:0,journal:[],provider:"discord"}));}}catch(e){}window.location.replace("/?auth=discord");</script></body></html>'
    );
  } catch (e) {
    res.status(500).send('Auth error: ' + e.message);
  }
};
