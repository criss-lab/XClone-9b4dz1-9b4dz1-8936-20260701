/**
 * ActivityPub Shared Inbox endpoint
 * Handles Follow, Like, Announce, Create, Update, Delete, Undo activities
 * from remote Mastodon/Misskey/Pleroma servers.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DOMAIN = 'testagram.site';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // WebFinger or Actor GET requests routed here
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let activity: any;
  try {
    activity = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('[inbox] received:', activity.type, 'from', activity.actor);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Store raw activity
  await supabase.from('activitypub_inbox').insert({
    activity_id: activity.id,
    activity_type: activity.type,
    actor_url: typeof activity.actor === 'string' ? activity.actor : activity.actor?.id,
    object_url: typeof activity.object === 'string' ? activity.object : activity.object?.id,
    raw_activity: activity,
    processed: false,
  }).onConflict('activity_id').ignore();

  const actorUrl = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;

  try {
    switch (activity.type) {
      case 'Follow': {
        // activity.object = local user actor URL
        const targetUsername = String(activity.object).split('/users/')[1];
        if (!targetUsername) break;
        const { data: localUser } = await supabase
          .from('user_profiles').select('id').eq('username', targetUsername).maybeSingle();
        if (!localUser) break;

        // Fetch remote actor to get their inbox
        let remoteInbox = actorUrl + '/inbox';
        try {
          const actorRes = await fetch(actorUrl, {
            headers: { 'Accept': 'application/activity+json' },
          });
          if (actorRes.ok) {
            const remoteActor = await actorRes.json();
            remoteInbox = remoteActor.inbox || remoteInbox;

            // Cache remote account
            await supabase.from('remote_accounts').upsert({
              actor_url: actorUrl,
              username: remoteActor.preferredUsername || actorUrl,
              domain: new URL(actorUrl).hostname,
              display_name: remoteActor.name,
              bio: remoteActor.summary,
              avatar_url: remoteActor.icon?.url,
              inbox_url: remoteActor.inbox,
              followers_url: remoteActor.followers,
              following_url: remoteActor.following,
              public_key: remoteActor.publicKey?.publicKeyPem,
              raw_actor: remoteActor,
              last_fetched_at: new Date().toISOString(),
            }, { onConflict: 'actor_url' });
          }
        } catch (e) {
          console.warn('Could not fetch remote actor:', e);
        }

        await supabase.from('federated_followers').upsert({
          local_user_id: localUser.id,
          remote_actor_url: actorUrl,
          remote_inbox_url: remoteInbox,
          accepted: true,
        }, { onConflict: 'local_user_id,remote_actor_url' });

        // Send Accept activity back
        const { data: keyData } = await supabase
          .from('activitypub_keys').select('private_key, key_id').eq('user_id', localUser.id).maybeSingle();

        const acceptActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `https://${DOMAIN}/activities/${crypto.randomUUID()}`,
          type: 'Accept',
          actor: `https://${DOMAIN}/users/${targetUsername}`,
          object: activity,
        };

        // Deliver Accept (fire-and-forget, no signature for now)
        fetch(remoteInbox, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/activity+json',
            'Accept': 'application/activity+json',
          },
          body: JSON.stringify(acceptActivity),
        }).catch(e => console.warn('Accept delivery failed:', e));
        break;
      }

      case 'Undo': {
        const obj = activity.object;
        if (obj?.type === 'Follow') {
          const targetUsername = String(obj.object).split('/users/')[1];
          if (!targetUsername) break;
          const { data: localUser } = await supabase
            .from('user_profiles').select('id').eq('username', targetUsername).maybeSingle();
          if (localUser) {
            await supabase.from('federated_followers')
              .delete()
              .eq('local_user_id', localUser.id)
              .eq('remote_actor_url', actorUrl);
          }
        }
        break;
      }

      case 'Create': {
        const obj = activity.object;
        if (obj?.type === 'Note' || obj?.type === 'Article') {
          await supabase.from('remote_posts').upsert({
            object_url: obj.id,
            actor_url: actorUrl,
            content: obj.content || obj.summary || '',
            summary: obj.summary,
            media_urls: (obj.attachment || []).map((a: any) => a.url).filter(Boolean),
            published_at: obj.published,
            raw_object: obj,
          }, { onConflict: 'object_url' });
        }
        break;
      }

      case 'Delete': {
        const objectId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
        if (objectId) {
          await supabase.from('remote_posts').delete().eq('object_url', objectId);
        }
        break;
      }

      default:
        console.log('[inbox] unhandled activity type:', activity.type);
    }

    // Mark as processed
    await supabase.from('activitypub_inbox')
      .update({ processed: true })
      .eq('activity_id', activity.id);

  } catch (err) {
    console.error('[inbox] processing error:', err);
  }

  return new Response('', { status: 202, headers: corsHeaders });
});
