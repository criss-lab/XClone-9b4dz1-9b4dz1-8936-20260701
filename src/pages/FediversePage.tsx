import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, UserPlus, Users, AtSign, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface RemoteAccount {
  actor_url: string;
  username: string;
  domain: string;
  display_name?: string;
  bio?: string;
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
      const { data, error } = await supabase.functions.invoke('activitypub-federation', {
        body: { action: 'get_federated_feed', limit: 30 },
      });
      if (error) throw error;
      setRemotePosts(data.posts || []);
    } catch (err: any) {
      console.error('Federated feed error:', err);
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
    const handle = searchHandle.trim().replace('@', '');
    if (!handle.includes('@')) {
      toast.error('Enter a full handle like user@mastodon.social');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('activitypub-federation', {
        body: { action: 'lookup_account', handle },
      });
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = await error.context?.text() || msg; } catch {}
        }
        throw new Error(msg);
      }
      setSearchResult(data.account);
    } catch (err: any) {
      toast.error(`Could not find @${handle}: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (account: RemoteAccount) => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      const { data, error } = await supabase.functions.invoke('activitypub-federation', {
        body: {
          action: 'follow_remote',
          local_user_id: user.id,
          remote_actor_url: account.actor_url,
        },
      });
      if (error) throw error;
      toast.success(`Follow request sent to @${account.username}@${account.domain}`);
      fetchFederationStats();
    } catch (err: any) {
      toast.error(err.message || 'Follow failed');
    } finally {
      setFollowing(false);
    }
  };

  const isFollowing = (actorUrl: string) =>
    federatedFollowing.some(f => f.remote_actor_url === actorUrl);

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Fediverse" showBack />

      {/* Header info */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-purple-500" />
          <span className="font-bold">Connected to the Fediverse</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your Testagram account is discoverable as <strong>@{user?.username}@testagram.site</strong> on Mastodon, Misskey, Pleroma, and other ActivityPub platforms.
        </p>
        {user && (
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>🌍 {federatedFollowers.length} remote followers</span>
            <span>➡️ {federatedFollowing.length} following on fediverse</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-muted/30 mx-4 my-3 rounded-xl p-1 gap-1">
        {[
          { id: 'feed',      label: 'Federated Feed', icon: Globe },
          { id: 'discover',  label: 'Find People',    icon: Search },
          { id: 'following', label: 'Remote Follows', icon: Users },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 space-y-4">

        {/* ── FEDERATED FEED ── */}
        {tab === 'feed' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Public Federated Timeline</h2>
              <Button size="sm" variant="outline" onClick={fetchFederatedFeed}>
                {loadingFeed ? <Loader2 className="w-4 h-4 animate-spin" /> : '↻ Refresh'}
              </Button>
            </div>
            {loadingFeed ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : remotePosts.length === 0 ? (
              <div className="text-center py-16">
                <Globe className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                <p className="font-semibold text-muted-foreground">No federated posts yet</p>
                <p className="text-sm text-muted-foreground mt-1">When people on Mastodon or other servers post publicly, their content appears here.</p>
                <Button onClick={() => setTab('discover')} className="mt-4" variant="outline">Find Fediverse Users</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {remotePosts.map(post => (
                  <div key={post.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                        {post.remote_accounts?.avatar_url ? (
                          <img src={post.remote_accounts.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                            {(post.remote_accounts?.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-bold text-sm">
                            {post.remote_accounts?.display_name || post.remote_accounts?.username}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            @{post.remote_accounts?.username}@{post.remote_accounts?.domain}
                          </span>
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 rounded-full ml-auto">
                            <Globe className="w-3 h-3 text-purple-500" />
                            <span className="text-xs text-purple-500">{post.remote_accounts?.domain}</span>
                          </div>
                        </div>
                        <div
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: post.content || '' }}
                        />
                        {post.published_at && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(post.published_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <a
                        href={post.object_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View original
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── DISCOVER ── */}
        {tab === 'discover' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <AtSign className="w-4 h-4 text-primary" />
                Search Fediverse Users
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Find anyone on Mastodon, Misskey, Pleroma, or any ActivityPub platform.
              </p>
              <div className="flex gap-2">
                <Input
                  value={searchHandle}
                  onChange={e => setSearchHandle(e.target.value)}
                  placeholder="@alice@mastodon.social"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching || !searchHandle.trim()}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {searchResult && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-full bg-muted overflow-hidden shrink-0">
                    {searchResult.avatar_url ? (
                      <img src={searchResult.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                        {searchResult.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{searchResult.display_name || searchResult.username}</p>
                    <p className="text-sm text-muted-foreground">@{searchResult.username}@{searchResult.domain}</p>
                    {searchResult.bio && (
                      <p
                        className="text-sm mt-1.5 text-foreground line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: searchResult.bio }}
                      />
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleFollow(searchResult)}
                        disabled={following || isFollowing(searchResult.actor_url)}
                        className="gap-1"
                      >
                        {following ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isFollowing(searchResult.actor_url) ? (
                          <><CheckCircle className="w-3.5 h-3.5" /> Following</>
                        ) : (
                          <><UserPlus className="w-3.5 h-3.5" /> Follow</>
                        )}
                      </Button>
                      <a
                        href={searchResult.actor_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View Profile
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-muted/30 border border-border rounded-2xl p-4 space-y-2">
              <p className="font-semibold text-sm">How Fediverse works</p>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li>• Your account is available as <strong>@{user?.username || 'you'}@testagram.site</strong></li>
                <li>• Mastodon users can search and follow you</li>
                <li>• Your public posts federate to their timelines</li>
                <li>• You can follow and see posts from any ActivityPub server</li>
                <li>• Replies and boosts work cross-platform</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── REMOTE FOLLOWING ── */}
        {tab === 'following' && (
          <div className="space-y-3">
            {!user ? (
              <div className="text-center py-12">
                <Button onClick={() => navigate('/auth')}>Sign in to view</Button>
              </div>
            ) : federatedFollowing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Not following anyone on the Fediverse yet</p>
                <Button onClick={() => setTab('discover')} variant="outline" className="mt-3" size="sm">
                  Discover Fediverse Users
                </Button>
              </div>
            ) : (
              federatedFollowing.map((f, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <Globe className="w-8 h-8 text-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.remote_username || 'Remote User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.remote_actor_url}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    f.accepted
                      ? 'bg-green-100 text-green-600 dark:bg-green-900/20'
                      : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20'
                  }`}>
                    {f.accepted ? 'Following' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
