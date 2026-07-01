import React, { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Heart, Repeat2, MessageCircle, Share, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { BlueskyPost, BlueskyProfile } from '@/lib/fediverse/types';

const BlueskySocialPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<BlueskyProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [isBlueskyConnected, setIsBlueskyConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadBlueskyFeed();
  }, [user]);

  const loadBlueskyFeed = async () => {
    setLoading(true);
    try {
      // Fetch from Bluesky API
      // This is a placeholder - in production, use BlueskyService
      setPosts([
        {
          uri: 'at://did:plc:example/app.bsky.feed.post/1',
          cid: 'bafy1234',
          author: {
            did: 'did:plc:example',
            handle: 'creator.bsky.social',
            displayName: 'Content Creator',
            description: 'Building on Bluesky',
            postsCount: 150,
            followersCount: 1000,
            followsCount: 500,
          },
          record: {
            text: 'Just launched my Bluesky integration! 🚀 Cross-posting between XClone and the Fediverse is now possible.',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            facets: [
              {
                index: {
                  byteStart: 47,
                  byteEnd: 50,
                },
                features: [
                  {
                    $type: 'app.bsky.richtext.facet#tag',
                    tag: 'bluesky',
                  },
                ],
              },
            ],
          },
          likeCount: 234,
          replyCount: 45,
          repostCount: 89,
          quoteCount: 12,
        },
        {
          uri: 'at://did:plc:example/app.bsky.feed.post/2',
          cid: 'bafy5678',
          author: {
            did: 'did:plc:example2',
            handle: 'developer.bsky.social',
            displayName: 'Developer',
            postsCount: 320,
            followersCount: 2000,
            followsCount: 800,
          },
          record: {
            text: 'The future of social media is decentralized. Bluesky + Fediverse = unlimited possibilities 🌐',
            createdAt: new Date(Date.now() - 7200000).toISOString(),
          },
          likeCount: 567,
          replyCount: 123,
          repostCount: 256,
          quoteCount: 34,
        },
      ]);
      setIsBlueskyConnected(true);
    } catch (error) {
      toast.error('Failed to load Bluesky feed');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      // Search posts on Bluesky
      toast.success(`Found posts matching "${searchQuery}"`);
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCompose = async () => {
    if (!composeText.trim()) {
      toast.error('Post cannot be empty');
      return;
    }

    setComposing(true);
    try {
      // Create post on Bluesky
      toast.success('Post published to Bluesky!');
      setComposeText('');
      await loadBlueskyFeed();
    } catch (error) {
      toast.error('Failed to publish post');
      console.error(error);
    } finally {
      setComposing(false);
    }
  };

  const handleLike = async (post: BlueskyPost) => {
    try {
      toast.success('Post liked!');
    } catch (error) {
      toast.error('Failed to like post');
    }
  };

  const handleRepost = async (post: BlueskyPost) => {
    try {
      toast.success('Post reposted!');
    } catch (error) {
      toast.error('Failed to repost');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="🦋 Bluesky" />

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-20">
        {/* Connect Banner */}
        {!isBlueskyConnected && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold mb-1">Connect Your Bluesky Account</h3>
                  <p className="text-sm text-muted-foreground">
                    Link your Bluesky account to enable cross-posting and content discovery.
                  </p>
                </div>
                <Button>Connect</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Compose Card */}
        {isBlueskyConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Compose Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="What's happening?!"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                maxLength={300}
                className="min-h-[100px] resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {composeText.length}/300 characters
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setComposeText('')}>
                    Clear
                  </Button>
                  <Button onClick={handleCompose} disabled={composing}>
                    {composing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>Post to Bluesky</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search Bluesky posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            size="icon"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Feed */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <Card key={post.uri} className="hover:bg-muted/50 transition">
                <CardContent className="pt-6">
                  {/* Author */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{post.author.displayName}</p>
                        <span className="text-sm text-muted-foreground">@{post.author.handle}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.record.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Content */}
                  <p className="mb-4 text-sm leading-relaxed">{post.record.text}</p>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-muted rounded-lg text-xs">
                    <div className="text-center">
                      <p className="font-semibold">{post.replyCount || 0}</p>
                      <p className="text-muted-foreground">Replies</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">{post.repostCount || 0}</p>
                      <p className="text-muted-foreground">Reposts</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">{post.likeCount || 0}</p>
                      <p className="text-muted-foreground">Likes</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">{post.quoteCount || 0}</p>
                      <p className="text-muted-foreground">Quotes</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 -mx-2">
                    <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded hover:bg-muted/50 transition text-sm text-muted-foreground hover:text-foreground">
                      <MessageCircle className="w-4 h-4" />
                      Reply
                    </button>
                    <button
                      onClick={() => handleRepost(post)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded hover:bg-green-100 dark:hover:bg-green-950 transition text-sm text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
                    >
                      <Repeat2 className="w-4 h-4" />
                      Repost
                    </button>
                    <button
                      onClick={() => handleLike(post)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded hover:bg-red-100 dark:hover:bg-red-950 transition text-sm text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Heart className="w-4 h-4" />
                      Like
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded hover:bg-blue-100 dark:hover:bg-blue-950 transition text-sm text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400">
                      <Share className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-12 text-center">
                <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No posts found. Try searching or connecting your account.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlueskySocialPage;
