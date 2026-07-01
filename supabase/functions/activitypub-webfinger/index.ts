/**
 * WebFinger endpoint — /.well-known/webfinger
 * Allows Mastodon/Misskey/Pleroma to discover Testagram users.
 * Route this edge function to /.well-known/webfinger in vercel.json rewrites.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DOMAIN = 'testagram.site';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');

  if (!resource) {
    return new Response(JSON.stringify({ error: 'resource param required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Parse acct:user@domain or https://domain/users/user
  let username: string | null = null;
  if (resource.startsWith('acct:')) {
    const [user, domain] = resource.slice(5).split('@');
    if (domain !== DOMAIN) {
      return new Response(JSON.stringify({ error: 'unknown domain' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    username = user;
  } else if (resource.startsWith(`https://${DOMAIN}/users/`)) {
    username = resource.split('/users/')[1];
  }

  if (!username) {
    return new Response(JSON.stringify({ error: 'invalid resource' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'user not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const webfinger = {
    subject: `acct:${profile.username}@${DOMAIN}`,
    aliases: [
      `https://${DOMAIN}/users/${profile.username}`,
    ],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${DOMAIN}/users/${profile.username}`,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${DOMAIN}/profile/${profile.username}`,
      },
    ],
  };

  return new Response(JSON.stringify(webfinger), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/jrd+json',
    },
  });
});
