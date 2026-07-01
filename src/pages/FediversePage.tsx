import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import * as federation from '@/api/federation';
import { toast } from 'sonner';

interface RemoteAccount {
  username: string;
  domain: string;
  actor_url: string;
  avatar_url?: string;
  inbox_url: string;
}

interface RemotePost {
  id: string;
  object_url: string;
  actor_url: string;
  content: string;
  published_at: string;
  remote_accounts?: RemoteAccount;
}

export default function FediversePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'feed' | 'discover' | 'following'>('feed');
  const [searchHandle, setSearchHandle] = useState('');
  const [searchResult, setSearchResult]   = useState<RemoteAccount | null>(null);
  const [searching, setSearching]         = useState(false);
  const [following, setFollowing]         = useState(false);
  const [remotePosts, setRemotePosts]     = useState<RemotePost[]>([]);
  const [loadingFeed, setLoadingFeed]     = useState(false);
  const [federatedFollowing, setFederatedFollowing] = useState<any[]>([]);
  const [federatedFollowers, setFederatedFollowers] = useState<any[]>([]);

  useEffect(() => {
    fetchFederatedFeed();
    if (user) fetchFederationStats();
  }, [user]);

  const fetchFederatedFeed = async () => {
    setLoadingFeed(true);
    try {
      // Prefer gateway timeline for federated feed
      const res: any = await federation.getGlobalTimeline({ limit: 30 });
      // Gateway may return { posts: [...] } or an array directly
      const posts = res?.posts ?? res ?? [];
      setRemotePosts(posts);
    } catch (err: any) {
      console.error('Federated feed error:', err);
      // Fallback: keep local cache if available
      try {
        const { data, error } = await supabase
          .from('remote_posts')
          .select(`*, remote_accounts(username, domain, display_name, avatar_url)`)
          .order('published_at', { ascending: false })
          .limit(30);
        if (!error) setRemotePosts(data || []);
      } catch (e) {
        console.error('Fallback remote_posts fetch failed', e);
      }
    } finally {
      setLoadingFeed(false);
    }
  };

  const fetchFederationStats = async () => {
    if (!user) return;
    const [followingRes, followersRes] = await Promise.all([
      supabase.from('federated_following').select('*').eq('local_user_id', user.id),
      supabase.from('federated_followers').select('*').eq('local_user_id', user.id),
    ]);
    setFederatedFollowing(followingRes.data || []);
    setFederatedFollowers(followersRes.data || []);
  };

  const handleSearch = async () => {
    const handle = searchHandle.trim().replace(/^@/, '');
    if (!handle.includes('@')) {
      toast.error('Enter a full handle like user@mastodon.social');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      // Use the gateway to lookup the remote account
      const actor = await federation.getUser(handle);
      if (actor) {
        const account: RemoteAccount = {
          actor_url: actor.id || handle,
          username: actor.preferredUsername || handle.split('@')[0],
          domain: handle.split('@')[1] || '',
          avatar_url: actor.icon?.url || actor.avatar_url,
          inbox_url: actor.inbox || '',
        };
        setSearchResult(account);
      } else {
        toast.error(`Could not find @${handle}`);
      }
    } catch (err: any) {
      console.error('Lookup failed', err);
      toast.error(`Could not find @${handle}: ${err.message || ''}`);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (account: RemoteAccount) => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      const target = account.actor_url || `${account.username}@${account.domain}`;
      await federation.follow(target);
      toast.success('Follow request sent');
      // Optionally refresh following state
      fetchFederationStats();
    } catch (err: any) {
      console.error('Follow failed', err);
      toast.error('Follow failed');
    } finally {
      setFollowing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Fediverse" showBack />

      <div className="max-w-4xl mx-auto p-4">
        {/* Search & discover UI (omitted for brevity) */}
        <div className="mb-4">
          <input
            className="w-full p-2 border rounded"
            placeholder="Search @user@domain"
            value={searchHandle}
            onChange={(e) => setSearchHandle(e.target.value)}
          />
          <button className="mt-2 px-3 py-1 bg-primary text-white rounded" onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching…' : 'Lookup'}
          </button>
        </div>

        {searchResult && (
          <div className="p-4 border rounded mb-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{searchResult.username}@{searchResult.domain}</div>
              <div className="text-sm text-muted-foreground">{searchResult.actor_url}</div>
            </div>
            <div>
              <button className="px-3 py-1 bg-primary text-white rounded" onClick={() => handleFollow(searchResult)} disabled={following}>
                {following ? 'Following…' : 'Follow'}
              </button>
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-2">Federated feed</h2>
        {loadingFeed ? (
          <div>Loading…</div>
        ) : (
          <div className="space-y-3">
            {remotePosts.map((p) => (
              <div key={p.id} className="p-3 border rounded">
                <div className="text-sm text-muted-foreground mb-1">{p.published_at || p.created_at}</div>
                <div dangerouslySetInnerHTML={{ __html: p.content || p.body || '' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
