/**
 * GET /api/auth/discord — start Discord OAuth
 * Env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
 * Discord redirect URI must be: https://YOUR_DOMAIN/api/auth/discord-callback
 */
module.exports = async function handler(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    res.status(500).send(
      'DISCORD_CLIENT_ID not set. Create an app at https://discord.com/developers/applications and add env vars on Vercel.'
    );
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = proto + '://' + host + '/api/auth/discord-callback';

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'identify email',
    redirect_uri: redirectUri,
    prompt: 'consent',
  });

  res.writeHead(302, {
    Location: 'https://discord.com/api/oauth2/authorize?' + params.toString(),
  });
  res.end();
};
