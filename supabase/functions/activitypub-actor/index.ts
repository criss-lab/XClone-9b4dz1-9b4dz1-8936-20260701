/**
 * ActivityPub Actor endpoint — /users/:username
 * Returns a Person object for Mastodon/Fediverse discovery.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DOMAIN = 'testagram.site';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Expect path like /activitypub-actor?username=alice
  const username = url.searchParams.get('username');

  if (!username) {
    return new Response(JSON.stringify({ error: 'username required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, username, bio, avatar_url, cover_image, verified, followers_count, following_count')
    .eq('username', username)
    .maybeSingle();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'user not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get or generate public key
  let { data: keyData } = await supabase
    .from('activitypub_keys')
    .select('public_key, key_id')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (!keyData) {
    // Generate a placeholder — real key generation via separate setup function
    keyData = {
      key_id: `https://${DOMAIN}/users/${username}#main-key`,
      public_key: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    };
  }

  const actorUrl = `https://${DOMAIN}/users/${username}`;

  const actor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      {
        manuallyApprovesFollowers: 'as:manuallyApprovesFollowers',
        toot: 'http://joinmastodon.org/ns#',
        featured: { '@id': 'toot:featured', '@type': '@id' },
        discoverable: 'toot:discoverable',
        indexable: 'toot:indexable',
      },
    ],
    id: actorUrl,
    type: 'Person',
    following: `${actorUrl}/following`,
    followers: `${actorUrl}/followers`,
    inbox: `${actorUrl}/inbox`,
    outbox: `${actorUrl}/outbox`,
    featured: `${actorUrl}/collections/featured`,
    preferredUsername: username,
    name: profile.username,
    summary: profile.bio || '',
    url: `https://${DOMAIN}/profile/${username}`,
    manuallyApprovesFollowers: false,
    discoverable: true,
    indexable: true,
    published: profile.verified ? '2024-01-01T00:00:00Z' : undefined,
    icon: profile.avatar_url
      ? {
          type: 'Image',
          mediaType: 'image/jpeg',
          url: profile.avatar_url,
        }
      : undefined,
    image: profile.cover_image
      ? {
          type: 'Image',
          mediaType: 'image/jpeg',
          url: profile.cover_image,
        }
      : undefined,
    publicKey: {
      id: keyData.key_id,
      owner: actorUrl,
      publicKeyPem: keyData.public_key,
    },
    endpoints: {
      sharedInbox: `https://${DOMAIN}/inbox`,
    },
    attachment: [],
    tag: [],
  };

  // Store actor record for later federation use
  await supabase.from('activitypub_actors').upsert({
    user_id: profile.id,
    actor_id: actorUrl,
    inbox_url: `${actorUrl}/inbox`,
    outbox_url: `${actorUrl}/outbox`,
    followers_url: `${actorUrl}/followers`,
    following_url: `${actorUrl}/following`,
    username,
    domain: DOMAIN,
  }, { onConflict: 'actor_id' });

  return new Response(JSON.stringify(actor), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/activity+json',
    },
  });
});
