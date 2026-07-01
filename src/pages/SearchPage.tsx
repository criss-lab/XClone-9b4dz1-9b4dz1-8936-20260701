import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Input } from '@/components/ui/input';
import { Search, Loader2, BadgeCheck, Globe, ExternalLink, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PostCard } from '@/components/features/PostCard';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [fediverseResults, setFediverseResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fediverseLoading, setFediverseLoading] = useState(false);

  const tabs = ['Posts', 'Users', 'Fediverse'];

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);

    try {
      const { data: postsData } = await supabase
        .from('posts')
        .select('*, user_profiles (*)')
        .or(`content.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts(postsData || []);

      const { data: usersData } = await supabase
        .from('user_profiles')
        .select('*')
        .or(`username.ilike.%${searchQuery}%,bio.ilike.%${searchQuery}%`)
        .limit(20);
      setUsers(usersData || []);

      // Fediverse search
      if (searchQuery.includes('@')) {
        setFediverseLoading(true);
        const cleaned = searchQuery.replace(/^@/, '');
        const { data: remoteData } = await supabase
          .from('remote_accounts')
          .select('*')
          .or(`username.ilike.%${cleaned}%,domain.ilike.%${cleaned}%`)
          .limit(20);
        setFediverseResults(remoteData || []);
        setFediverseLoading(false);

        // Live lookup if proper handle format
        if (cleaned.includes('@')) {
          try {
            const { data } = await supabase.functions.invoke('activitypub-federation', {
              body: { action: 'lookup_account', handle: cleaned },
            });
            if (data?.account) {
              setFediverseResults(prev => {
                const exists = prev.some(r => r.actor_url === data.account.actor_url);
                return exists ? prev : [data.account, ...prev];
              });
            }
          } catch {}
        }
      } else {
        setFediverseResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleFediverseFollow = async (account: any) => {
    if (!user) { navigate('/auth'); return; }
    try {
      await supabase.functions.invoke('activitypub-federation', {
        body: { action: 'follow_remote', local_user_id: user.id, remote_actor_url: account.actor_url },
      });
      toast.success(`Follow request sent to @${account.username}@${account.domain}`);
    } catch {
      toast.error('Follow failed');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Search" showBack />

      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <form onSubmit={handleSearch} className="p-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search posts, people, or @user@domain…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-11 rounded-full bg-muted border-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </form>

        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-4 font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab === 'Fediverse' && <Globe className="w-3.5 h-3.5" />}
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {activeTab === 'Posts' && (
            posts.length > 0 ? (
              posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={() => performSearch(query)} />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No posts found{query ? ` for "${query}"` : ''}</p>
              </div>
            )
          )}

          {activeTab === 'Users' && (
            <div className="divide-y divide-border">
              {users.length > 0 ? (
                users.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => navigate(`/profile/${u.username}`)}
                    className="p-4 hover:bg-muted/5 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold">
                            {u.username[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <p className="font-semibold">{u.username}</p>
                          {u.verified && (
                            <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                          )}
                        </div>
                        {u.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{u.bio}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {u.followers_count} followers
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No users found{query ? ` for "${query}"` : ''}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Fediverse' && (
            <div className="divide-y divide-border">
              {/* Search hint */}
              <div className="px-4 py-3 bg-purple-500/5 border-b border-purple-500/10">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-500" />
                  Search across Mastodon, Misskey, Pleroma and 8000+ servers — use @user@domain format
                </p>
              </div>

              {fediverseLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {!fediverseLoading && fediverseResults.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Search for Fediverse users</p>
                  <p className="text-sm mt-1">Try: @alice@mastodon.social</p>
                </div>
              )}

              {fediverseResults.map((account: any) => (
                <div key={account.actor_url} className="p-4 hover:bg-muted/5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
                      {account.avatar_url ? (
                        <img src={account.avatar_url} alt={account.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-lg">
                          {account.username[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{account.display_name || account.username}</p>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 rounded-full">
                          <Globe className="w-3 h-3 text-purple-500" />
                          <span className="text-xs text-purple-500">{account.domain}</span>
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">@{account.username}@{account.domain}</p>
                      {account.bio && (
                        <div
                          className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: account.bio }}
                        />
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={account.actor_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-muted rounded-full transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </a>
                      <button
                        onClick={() => handleFediverseFollow(account)}
                        className="p-2 hover:bg-primary/10 rounded-full transition-colors"
                        title="Follow"
                      >
                        <UserPlus className="w-4 h-4 text-primary" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
