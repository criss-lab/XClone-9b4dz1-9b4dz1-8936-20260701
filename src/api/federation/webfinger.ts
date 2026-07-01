// WebFinger Endpoint (.well-known/webfinger)
// Used for discovering federation information

import { supabase } from '@/lib/supabase';
import { federationConfig } from '@/lib/config/federation';

export interface WebFingerRequest {
  resource: string; // acct:user@domain
}

export interface WebFingerResponse {
  subject: string;
  aliases: string[];
  links: Array<{
    rel: string;
    type?: string;
    href?: string;
    template?: string;
  }>;
}

export async function handleWebFinger(resource: string): Promise<WebFingerResponse | null> {
  // Parse resource
  const match = resource.match(/acct:(.+)@(.+)/);
  if (!match) return null;

  const [, username, domain] = match;

  // Verify domain matches our instance
  const instanceDomain = new URL(federationConfig.instanceUrl).hostname;
  if (domain !== instanceDomain) return null;

  // Get user from database
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, email')
    .eq('username', username)
    .single();

  if (error || !user) return null;

  const userId = user.id;
  const actorId = `${federationConfig.instanceUrl}/users/${userId}`;

  return {
    subject: resource,
    aliases: [
      actorId,
      `${federationConfig.instanceUrl}/profile/${username}`,
    ],
    links: [
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `${federationConfig.instanceUrl}/profile/${username}`,
      },
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorId,
      },
      {
        rel: 'http://ostatus.org/schema/1.0/subscribe',
        template: `${federationConfig.instanceUrl}/authorize_follow?acct={uri}`,
      },
    ],
  };
}
