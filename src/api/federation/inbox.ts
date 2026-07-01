// Federation Inbox Handler
// Receives ActivityPub activities from other instances

import { supabase } from '@/lib/supabase';
import { FederationAPI } from '@/lib/api/federation-api';
import { federationConfig } from '@/lib/config/federation';

interface InboxActivity {
  '@context': string | string[];
  type: string;
  actor: string;
  object: any;
  target?: string;
  published: string;
  id: string;
}

export async function handleInboxActivity(activity: InboxActivity): Promise<void> {
  // Verify signature
  const headers = {
    'signature': activity.id || '',
  };

  if (!FederationAPI.verifySignature(headers)) {
    throw new Error('Invalid signature');
  }

  // Store activity in database
  const { error } = await supabase.from('federated_activities').insert({
    activity_type: activity.type,
    actor: activity.actor,
    object: activity.object,
    data: activity,
    received_at: new Date().toISOString(),
  });

  if (error) throw error;

  // Process based on activity type
  switch (activity.type) {
    case 'Create':
      await handleCreate(activity);
      break;
    case 'Update':
      await handleUpdate(activity);
      break;
    case 'Delete':
      await handleDelete(activity);
      break;
    case 'Like':
      await handleLike(activity);
      break;
    case 'Announce':
      await handleAnnounce(activity);
      break;
    case 'Follow':
      await handleFollow(activity);
      break;
    case 'Undo':
      await handleUndo(activity);
      break;
  }
}

async function handleCreate(activity: InboxActivity): Promise<void> {
  const post = activity.object;
  
  const { error } = await supabase.from('federated_posts').insert({
    activity_pub_uri: post.id,
    content: post.content,
    attributed_to: activity.actor,
    published_at: new Date(post.published).toISOString(),
    data: post,
  });

  if (error) console.error('Failed to save federated post:', error);
}

async function handleUpdate(activity: InboxActivity): Promise<void> {
  const post = activity.object;
  
  const { error } = await supabase
    .from('federated_posts')
    .update({
      content: post.content,
      data: post,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_pub_uri', post.id);

  if (error) console.error('Failed to update federated post:', error);
}

async function handleDelete(activity: InboxActivity): Promise<void> {
  const { error } = await supabase
    .from('federated_posts')
    .delete()
    .eq('activity_pub_uri', activity.object);

  if (error) console.error('Failed to delete federated post:', error);
}

async function handleLike(activity: InboxActivity): Promise<void> {
  const { error } = await supabase.from('federated_interactions').insert({
    activity_pub_uri: activity.object,
    interaction_type: 'like',
    source_actor_id: activity.actor,
    data: activity,
  });

  if (error) console.error('Failed to save like:', error);
}

async function handleAnnounce(activity: InboxActivity): Promise<void> {
  const { error } = await supabase.from('federated_interactions').insert({
    activity_pub_uri: activity.object,
    interaction_type: 'announce',
    source_actor_id: activity.actor,
    data: activity,
  });

  if (error) console.error('Failed to save announce:', error);
}

async function handleFollow(activity: InboxActivity): Promise<void> {
  // Store follow request
  const { error } = await supabase.from('federated_followers').insert({
    actor_id: activity.actor,
    follower_uri: activity.id,
    data: activity,
  });

  if (error) console.error('Failed to save follow:', error);

  // Send Accept activity
  await sendAccept(activity.actor, activity.id);
}

async function handleUndo(activity: InboxActivity): Promise<void> {
  // Handle undo operations (unfollow, unlike, etc.)
  const targetId = activity.object.id || activity.object;
  
  const { error } = await supabase
    .from('federated_interactions')
    .delete()
    .eq('activity_pub_uri', targetId)
    .eq('source_actor_id', activity.actor);

  if (error) console.error('Failed to undo:', error);
}

async function sendAccept(actor: string, followId: string): Promise<void> {
  const acceptActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Accept',
    actor: `${federationConfig.instanceUrl}/users/system`,
    object: followId,
    published: new Date().toISOString(),
  };

  try {
    await FederationAPI.sendToInstance(actor, '/inbox', acceptActivity);
  } catch (error) {
    console.error('Failed to send Accept:', error);
  }
}
