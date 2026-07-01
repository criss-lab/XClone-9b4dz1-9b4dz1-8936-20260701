/**
 * RSA Key Auto-Generation for ActivityPub actors
 * Called when a new user is created (via trigger or signup hook)
 * Generates RSA-2048 key pair using Web Crypto API (Deno-native)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DOMAIN = 'testagram.site';

// Export public key as PEM
async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return pem;
}

// Export private key as PEM
async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
  return pem;
}

async function generateRSAKeyPair(userId: string, username: string) {
  // Generate RSA-PKCS1-v1_5 with SHA-256 (Mastodon compatible)
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  const [publicKeyPem, privateKeyPem] = await Promise.all([
    exportPublicKey(keyPair.publicKey),
    exportPrivateKey(keyPair.privateKey),
  ]);

  const keyId = `https://${DOMAIN}/users/${username}#main-key`;

  return { publicKeyPem, privateKeyPem, keyId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let body: { user_id?: string; username?: string; generate_all_missing?: boolean } = {};
  try { body = await req.json(); } catch {}

  // ── Generate keys for a specific user ──────────────────────────────────────
  if (body.user_id && body.username) {
    const { user_id, username } = body;

    // Check if keys already exist
    const { data: existing } = await supabase
      .from('activitypub_keys')
      .select('id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, message: 'Keys already exist' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const { publicKeyPem, privateKeyPem, keyId } = await generateRSAKeyPair(user_id, username);

      await supabase.from('activitypub_keys').insert({
        user_id,
        public_key: publicKeyPem,
        private_key: privateKeyPem,
        key_id: keyId,
      });

      // Also upsert actor record
      await supabase.from('activitypub_actors').upsert({
        user_id,
        actor_id: `https://${DOMAIN}/users/${username}`,
        inbox_url: `https://${DOMAIN}/users/${username}/inbox`,
        outbox_url: `https://${DOMAIN}/users/${username}/outbox`,
        followers_url: `https://${DOMAIN}/users/${username}/followers`,
        following_url: `https://${DOMAIN}/users/${username}/following`,
        username,
        domain: DOMAIN,
      }, { onConflict: 'actor_id' });

      console.log(`[keygen] Generated RSA keys for ${username} (${user_id})`);

      return new Response(JSON.stringify({ success: true, key_id: keyId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('[keygen] Error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Backfill: generate keys for ALL users without them ─────────────────────
  if (body.generate_all_missing) {
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, username');

    const { data: existingKeys } = await supabase
      .from('activitypub_keys')
      .select('user_id');

    const existingIds = new Set((existingKeys || []).map(k => k.user_id));
    const missing = (users || []).filter(u => !existingIds.has(u.id) && u.username);

    console.log(`[keygen] Backfilling ${missing.length} users without keys`);

    let generated = 0;
    for (const u of missing) {
      try {
        const { publicKeyPem, privateKeyPem, keyId } = await generateRSAKeyPair(u.id, u.username);
        await supabase.from('activitypub_keys').insert({
          user_id: u.id,
          public_key: publicKeyPem,
          private_key: privateKeyPem,
          key_id: keyId,
        });
        generated++;
      } catch (e) {
        console.warn(`[keygen] Failed for ${u.username}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, generated, total: missing.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Provide user_id+username or generate_all_missing:true' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
