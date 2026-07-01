/**
 * Federation helper — handles:
 * 1. Remote account lookup (WebFinger + Actor fetch)
 * 2. Delivering outbox activities to remote followers
 * 3. Federated follow/unfollow actions
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DOMAIN = 'testagram.site';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { action, ...params } = await req.json();

  // ── Lookup remote account ─────────────────────────────────────────────────
  if (action === 'lookup_account') {
    const { handle } = params; // e.g. alice@mastodon.social
    const [user, domain] = handle.replace('@', '').split('@');
    if (!user || !domain) {
      return json({ error: 'Invalid handle' }, 400);
    }

    try {
      // WebFinger discovery
      const wfUrl = `https://${domain}/.well-known/webfinger?resource=acct:${user}@${domain}`;
      const wfRes = await fetch(wfUrl, { headers: { Accept: 'application/jrd+json' } });
      if (!wfRes.ok) throw new Error(`WebFinger failed: ${wfRes.status}`);
      const wf = await wfRes.json();

      const selfLink = wf.links?.find((l: any) => l.rel === 'self' && l.type === 'application/activity+json');
      if (!selfLink?.href) throw new Error('No ActivityPub self link found');

      // Fetch actor
      const actorRes = await fetch(selfLink.href, {
        headers: { Accept: 'application/activity+json' },
      });
      if (!actorRes.ok) throw new Error(`Actor fetch failed: ${actorRes.status}`);
      const actor = await actorRes.json();

      const account = {
        actor_url: actor.id,
        username: actor.preferredUsername || user,
        domain,
        display_name: actor.name || actor.preferredUsername,
        bio: actor.summary,
        avatar_url: actor.icon?.url,
        header_url: actor.image?.url,
        inbox_url: actor.inbox,
        followers_url: actor.followers,
        following_url: actor.following,
        public_key: actor.publicKey?.publicKeyPem,
        raw_actor: actor,
        last_fetched_at: new Date().toISOString(),
      };

      // Cache it
      await supabase.from('remote_accounts').upsert(account, { onConflict: 'actor_url' });

      return json({ account });
    } catch (err: any) {
      return json({ error: err.message }, 404);
    }
  }

  // ── Follow remote account ──────────────────────────────────────────────────
  if (action === 'follow_remote') {
    const { local_user_id, remote_actor_url } = params;

    const { data: localUser } = await supabase
      .from('user_profiles').select('id, username').eq('id', local_user_id).maybeSingle();
    if (!localUser) return json({ error: 'Local user not found' }, 404);

    const { data: remoteAccount } = await supabase
      .from('remote_accounts').select('inbox_url').eq('actor_url', remote_actor_url).maybeSingle();
    if (!remoteAccount) return json({ error: 'Remote account not cached. Run lookup first.' }, 404);

    await supabase.from('federated_following').upsert({
      local_user_id,
      remote_actor_url,
      remote_username: remote_actor_url.split('/').pop(),
      remote_domain: new URL(remote_actor_url).hostname,
      accepted: false,
    }, { onConflict: 'local_user_id,remote_actor_url' });

    const followActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${DOMAIN}/activities/${crypto.randomUUID()}`,
      type: 'Follow',
      actor: `https://${DOMAIN}/users/${localUser.username}`,
      object: remote_actor_url,
    };

    // Store in outbox
    await supabase.from('activitypub_outbox').insert({
      user_id: local_user_id,
      activity_id: followActivity.id,
      activity_type: 'Follow',
      object_id: remote_actor_url,
      raw_activity: followActivity,
    });

    // Deliver to remote inbox
    const deliveryRes = await fetch(remoteAccount.inbox_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
      },
      body: JSON.stringify(followActivity),
    });

    return json({ success: deliveryRes.ok, status: deliveryRes.status });
  }

  // ── Publish local post to federated followers ────────────────────────────
  if (action === 'publish_post') {
    const { user_id, post_id, content, media_urls, published_at } = params;

    const { data: localUser } = await supabase
      .from('user_profiles').select('id, username').eq('id', user_id).maybeSingle();
    if (!localUser) return json({ error: 'User not found' }, 404);

    const noteUrl = `https://${DOMAIN}/posts/${post_id}`;
    const actorUrl = `https://${DOMAIN}/users/${localUser.username}`;

    const note: any = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: noteUrl,
      type: 'Note',
      attributedTo: actorUrl,
      content,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${actorUrl}/followers`],
      published: published_at || new Date().toISOString(),
      url: noteUrl,
    };

    if (media_urls?.length) {
      note.attachment = media_urls.map((url: string) => ({
        type: 'Document',
        mediaType: url.includes('.mp4') || url.includes('.webm') ? 'video/mp4' : 'image/jpeg',
        url,
      }));
    }

    const createActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${DOMAIN}/activities/${crypto.randomUUID()}`,
      type: 'Create',
      actor: actorUrl,
      published: note.published,
      to: note.to,
      cc: note.cc,
      object: note,
    };

    await supabase.from('activitypub_outbox').insert({
      user_id,
      activity_id: createActivity.id,
      activity_type: 'Create',
      object_id: noteUrl,
      raw_activity: createActivity,
    });

    // Get all remote followers' inboxes
    const { data: followers } = await supabase
      .from('federated_followers')
      .select('remote_inbox_url')
      .eq('local_user_id', user_id);

    // Deliver to all (fire-and-forget with basic retry)
    const inboxes = [...new Set((followers || []).map((f: any) => f.remote_inbox_url))];
    let delivered = 0;
    for (const inbox of inboxes) {
      try {
        const res = await fetch(inbox, {
          method: 'POST',
          headers: { 'Content-Type': 'application/activity+json' },
          body: JSON.stringify(createActivity),
        });
        if (res.ok) delivered++;
      } catch (e) {
        console.warn('Delivery failed to', inbox, e);
      }
    }

    await supabase.from('activitypub_outbox')
      .update({ delivered: true })
      .eq('activity_id', createActivity.id);

    return json({ success: true, delivered, total: inboxes.length });
  }

  // ── Fetch federated feed ──────────────────────────────────────────────────
  if (action === 'get_federated_feed') {
    const { limit = 20, offset = 0 } = params;
    const { data: posts } = await supabase
      .from('remote_posts')
      .select(`*, remote_accounts(username, domain, display_name, avatar_url)`)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return json({ posts: posts || [] });
  }

  return json({ error: 'Unknown action' }, 400);
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
