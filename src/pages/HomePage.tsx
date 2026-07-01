import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ComposePost } from '@/components/features/ComposePost';
import { PostCard } from '@/components/features/PostCard';
import { UserSuggestions } from '@/components/features/UserSuggestions';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { Loader2, Sparkles, Hash, MessageCircle, Repeat2, Heart, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { DynamicAd } from '@/components/features/DynamicAd';
import { NativeAdCard } from '@/components/features/NativeAdCard';
import { usePageBanner } from '@/hooks/usePageBanner';
import { ADMOB_CONFIG } from '@/lib/admob';
import { SponsoredPostCard } from '@/components/features/SponsoredPostCard';

const PAGE_SIZE = 15;

type FeedItem =
  | { type: 'post'; data: Post }
  | { type: 'thread'; data: any }
  | { type: 'sponsored'; data: any }
  | { type: 'user-suggestions'; data: null };

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');
  const [page, setPage] = useState(0);
  const [sponsoredPosts, setSponsoredPosts] = useState<any[]>([]);

  // AdMob banner at bottom
  usePageBanner({ adId: ADMOB_CONFIG.BANNER_FEED, margin: 64, delay: 4000 });

  useEffect(() => {
    fetchInitialFeed();
    fetchSponsoredContent();
  }, [activeTab, user]);

  const fetchSponsoredContent = async () => {
    try {
      const { data } = await supabase.rpc('get_sponsored_posts', {
        user_id_param: user?.id,
        limit_param: 3
      });
      if (data) setSponsoredPosts(data);
    } catch {}
  };

  const fetchInitialFeed = async () => {
    setLoading(true);
    setFeedItems([]);
    setPage(0);
    const items = await fetchFeed(0, []);
    setFeedItems(items);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInitialFeed();
    setRefreshing(false);
  };

  /**
   * Fetches a mixed feed:
   * - "For you": ranked by engagement score (views + likes + recency)
   * - "Following": only posts from followed users
   */
  const fetchFeed = async (pageNum: number, currentSponsored: any[]): Promise<FeedItem[]> => {
    try {
      const items: FeedItem[] = [];

      let postsQuery = supabase
        .from('posts')
        .select('*, user_profiles (*)')
        .is('community_id', null)
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      let threadsQuery = supabase
        .from('threads')
        .select('*, user_profiles (*)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(pageNum * 5, (pageNum + 1) * 5 - 1);

      if (activeTab === 'following' && user) {
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const ids = followingData?.map(f => f.following_id) || [];
        if (ids.length === 0) return [];

        postsQuery = postsQuery.in('user_id', ids).order('created_at', { ascending: false });
        threadsQuery = threadsQuery.in('user_id', ids);
      } else {
        // For You: order by recency first, then we'll re-rank by engagement
        postsQuery = postsQuery.order('created_at', { ascending: false });
      }

      const [postsRes, threadsRes] = await Promise.all([postsQuery, threadsQuery]);

      // Fetch boosted post IDs to annotate posts
      const postIds = (postsRes.data || []).map(p => p.id);
      let boostedMap: Record<string, { boost_type: string }> = {};
      if (postIds.length > 0) {
        const { data: boostedData } = await supabase
          .from('boosted_posts')
          .select('post_id, boost_type, budget')
          .in('post_id', postIds)
          .eq('is_active', true);
        (boostedData || []).forEach(b => {
          boostedMap[b.post_id] = { boost_type: b.budget > 0 ? 'paid' : 'rewarded_ad' };
        });
      }

      // Engagement scoring: views*0.1 + likes*2 + reposts*3 + recencyScore
      const scorePost = (p: any) => {
        const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
        const recencyScore = Math.max(0, 100 - ageHours * 0.5); // decays over ~200 hours
        return (p.views_count || 0) * 0.1 + (p.likes_count || 0) * 2 + (p.reposts_count || 0) * 3 + recencyScore;
      };

      const posts = (postsRes.data || []).map(p => ({
        type: 'post' as const,
        data: {
          ...p,
          is_boosted: !!boostedMap[p.id],
          boost_type: boostedMap[p.id]?.boost_type,
        },
        _score: scorePost(p),
        _ts: new Date(p.created_at).getTime()
      }));

      const threads = (threadsRes.data || []).map(t => ({
        type: 'thread' as const,
        data: t,
        _score: 0,
        _ts: new Date(t.created_at).getTime()
      }));

      // For You: rank by engagement score; Following: keep chronological
      let combined = [...posts, ...threads];
      if (activeTab === 'foryou') {
        combined.sort((a, b) => b._score - a._score);
      } else {
        combined.sort((a, b) => b._ts - a._ts);
      }

      // Insert user suggestions block after 3rd item (first page only)
      const withExtras: FeedItem[] = [];
      let sponsoredIdx = 0;
      let suggestionInserted = false;

      for (let i = 0; i < combined.length; i++) {
        withExtras.push({ type: combined[i].type, data: combined[i].data } as FeedItem);

        // Insert user suggestions widget after 3rd post on first page
        if (i === 2 && pageNum === 0 && !suggestionInserted) {
          withExtras.push({ type: 'user-suggestions', data: null });
          suggestionInserted = true;
        }

        // Insert sponsored post every 6–8 items
        if ((i + 1) % (6 + Math.floor(Math.random() * 3)) === 0) {
          const spList = currentSponsored.length > 0 ? currentSponsored : sponsoredPosts;
          if (sponsoredIdx < spList.length) {
            withExtras.push({ type: 'sponsored', data: spList[sponsoredIdx] });
            sponsoredIdx++;
          }
        }
      }

      return withExtras;
    } catch (err) {
      console.error('fetchFeed error:', err);
      return [];
    }
  };

  const loadMoreFeed = async (): Promise<boolean> => {
    const nextPage = page + 1;
    const newItems = await fetchFeed(nextPage, sponsoredPosts);
    if (newItems.length > 0) {
      setFeedItems(prev => [...prev, ...newItems]);
      setPage(nextPage);
      return newItems.length >= PAGE_SIZE;
    }
    return false;
  };

  const { lastElementRef, loading: loadingMore } = useInfiniteScroll(loadMoreFeed);

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <TopBar title="Home" />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('foryou')}
            className={`flex-1 py-4 font-semibold transition-colors border-b-2 ${
              activeTab === 'foryou' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>For you</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('following')}
            className={`flex-1 py-4 font-semibold transition-colors border-b-2 ${
              activeTab === 'following' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            Following
          </button>
        </div>
      </div>

      <ComposePost onSuccess={fetchInitialFeed} />

      {/* Top feed ad — web only */}
      <DynamicAd location="feed_top" className="border-b border-border p-4" />

      {/* Pull-to-refresh button */}
      {!loading && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Pull to refresh'}
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : feedItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-semibold mb-2">No content yet</p>
          <p className="text-sm">
            {activeTab === 'following'
              ? 'Follow some users to see their posts here'
              : 'Be the first to post!'}
          </p>
        </div>
      ) : (
        <>
          {feedItems.map((item, index) => (
            <div
              key={`${item.type}-${item.type === 'user-suggestions' ? 'suggestions' : item.data?.id}-${index}`}
              ref={index === feedItems.length - 1 ? lastElementRef : null}
              className="animate-slide-in"
            >
              {item.type === 'post' ? (
                <PostCard post={item.data} onUpdate={fetchInitialFeed} />
              ) : item.type === 'sponsored' ? (
                <SponsoredPostCard post={item.data} />
              ) : item.type === 'user-suggestions' ? (
                <InlineSuggestions />
              ) : (
                <ThreadCard thread={item.data} />
              )}

              {/* Native ad card every 6 posts (AdMob native unit) */}
              {(index + 1) % 6 === 0 && index !== feedItems.length - 1 && (
                <NativeAdCard className="mx-0 rounded-none border-x-0 border-b border-border" />
              )}
              {/* Web display ad every 8 posts */}
              {(index + 1) % 8 === 0 && (
                <DynamicAd location="feed_inline" className="border-b border-border px-4 py-3" />
              )}
            </div>
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Inline User Suggestions ─────────────────────────────────────────────────
function InlineSuggestions() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSuggestions();
  }, [user]);

  const fetchSuggestions = async () => {
    if (!user) return;
    try {
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followed = new Set(followData?.map(f => f.following_id) || []);
      setFollowingIds(followed);

      // Get popular users not yet followed
      const { data } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, bio, verified, followers_count, is_creator')
        .neq('id', user.id)
        .order('followers_count', { ascending: false })
        .limit(10);

      if (data) {
        const notFollowed = data.filter(u => !followed.has(u.id)).slice(0, 5);
        setSuggestions(notFollowed);
      }
    } catch {}
  };

  const handleFollow = async (targetId: string) => {
    if (!user) { return; }
    try {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
      setFollowingIds(prev => new Set([...prev, targetId]));
    } catch {}
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="border-b border-border p-4 bg-muted/20">
      <h3 className="font-bold text-sm mb-3 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        Who to follow
      </h3>
      <div className="space-y-3">
        {suggestions.slice(0, 3).map(sug => (
          <div key={sug.id} className="flex items-center justify-between">
            <button
              onClick={() => navigate(`/profile/${sug.username}`)}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                {sug.avatar_url ? (
                  <img src={sug.avatar_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                    {sug.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{sug.username}</p>
                <p className="text-xs text-muted-foreground">{formatNumber(sug.followers_count || 0)} followers</p>
              </div>
            </button>
            <button
              onClick={() => handleFollow(sug.id)}
              disabled={followingIds.has(sug.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors flex-shrink-0 ${
                followingIds.has(sug.id)
                  ? 'bg-muted text-muted-foreground border-border'
                  : 'border-foreground hover:bg-muted'
              }`}
            >
              {followingIds.has(sug.id) ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Thread Card ──────────────────────────────────────────────────────────────
function ThreadCard({ thread }: { thread: any }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/thread/${thread.id}`)}
      className="border-b border-border p-4 hover:bg-muted/5 cursor-pointer transition-colors"
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
          {thread.user_profiles?.avatar_url ? (
            <img src={thread.user_profiles.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-sm">
              {thread.user_profiles?.username?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm">{thread.user_profiles?.username}</span>
            <span className="text-muted-foreground text-xs">
              · {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <Hash className="w-3.5 h-3.5 text-primary" />
            <h3 className="font-bold text-base">{thread.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{thread.content}</p>
          {thread.cover_image && (
            <div className="mt-2 rounded-xl overflow-hidden border border-border">
              <img src={thread.cover_image} alt={thread.title} className="w-full max-h-48 object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex items-center gap-5 mt-2 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-xs">
              <MessageCircle className="w-3.5 h-3.5" />
              {formatNumber(thread.replies_count || 0)}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Repeat2 className="w-3.5 h-3.5" />
              {formatNumber(thread.reposts_count || 0)}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Heart className="w-3.5 h-3.5" />
              {formatNumber(thread.likes_count || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
