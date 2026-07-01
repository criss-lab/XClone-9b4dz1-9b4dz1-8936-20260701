import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Repeat2, UserPlus, MessageCircle, AtSign,
  BadgeCheck, Loader2, DollarSign, CheckCircle2, Smartphone,
  TrendingUp, Bell, CreditCard, ArrowDownLeft
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

const PAGE_SIZE = 20;

type NotifTab = 'all' | 'mentions' | 'payments';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (user) { fetchNotifications(); markAsRead(); }
    else navigate('/auth');
  }, [user, activeTab]);

  const fetchNotifications = async (pageNum = 0) => {
    if (!user) return;
    try {
      let query = supabase
        .from('notifications')
        .select(`*, from_user:user_profiles!notifications_from_user_id_fkey(*), post:posts(*)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (activeTab === 'mentions') {
        query = query.eq('type', 'mention');
      } else if (activeTab === 'payments') {
        query = query.in('type', ['payment_success', 'payment_sent', 'payment_failed', 'payout_sent', 'deposit_confirmed', 'boost_activated']);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (pageNum === 0) setNotifications(data || []);
      else setNotifications(prev => [...prev, ...(data || [])]);
      setPage(pageNum);
    } catch (err) {
      console.error('fetchNotifications error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  };

  const loadMore = async (): Promise<boolean> => {
    const nextPage = page + 1;
    await fetchNotifications(nextPage);
    return notifications.length % PAGE_SIZE === 0;
  };

  const { lastElementRef, loading: loadingMore } = useInfiniteScroll(loadMore);

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':             return <Heart className="w-8 h-8 text-pink-600" fill="currentColor" />;
      case 'repost':           return <Repeat2 className="w-8 h-8 text-green-500" />;
      case 'follow':           return <UserPlus className="w-8 h-8 text-primary" />;
      case 'reply':            return <MessageCircle className="w-8 h-8 text-primary" />;
      case 'mention':          return <AtSign className="w-8 h-8 text-primary" />;
      case 'payment_success':
      case 'deposit_confirmed':
                               return <CheckCircle2 className="w-8 h-8 text-green-600" />;
      case 'payment_sent':
      case 'payout_sent':      return <ArrowDownLeft className="w-8 h-8 text-blue-600" />;
      case 'payment_failed':   return <CreditCard className="w-8 h-8 text-destructive" />;
      case 'boost_activated':  return <TrendingUp className="w-8 h-8 text-purple-600" />;
      default:                 return <Bell className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const getText = (n: any) => {
    const username = n.from_user?.username || 'Someone';
    const meta = n.metadata || {};
    switch (n.type) {
      case 'like':              return `${username} liked your post`;
      case 'repost':            return `${username} reposted your post`;
      case 'follow':            return `${username} followed you`;
      case 'reply':             return `${username} replied to your post`;
      case 'mention':           return `${username} mentioned you`;
      case 'payment_success':
        return meta.message || `M-Pesa payment of KES ${meta.amount ?? ''} confirmed`;
      case 'deposit_confirmed':
        return `Deposit of KES ${meta.kes_amount ?? meta.amount ?? ''} confirmed · Receipt: ${meta.receipt || ''}`;
      case 'payment_sent':
        if (meta.purpose === 'creator_payout')
          return `Creator payout of $${meta.amount} (KES ${meta.kes_amount}) sent to ${meta.phone}`;
        if (meta.purpose === 'paypal_withdrawal')
          return `PayPal withdrawal of $${meta.amount} submitted to ${meta.email}`;
        return `Payment of $${meta.amount} sent`;
      case 'payout_sent':
        return `Payout of $${meta.amount} sent via ${meta.method || 'M-Pesa'}`;
      case 'payment_failed':
        return `Payment failed — ${meta.reason || 'please try again'}`;
      case 'boost_activated':
        return `Your post boost is now active · Est. reach: ${(meta.estimated_reach || 0).toLocaleString()}`;
      default:                  return 'New notification';
    }
  };

  const isPaymentType = (type: string) =>
    ['payment_success', 'payment_sent', 'payment_failed', 'payout_sent', 'deposit_confirmed', 'boost_activated'].includes(type);

  const getNotifBg = (type: string) => {
    if (['payment_success', 'deposit_confirmed'].includes(type)) return 'bg-green-50/50 dark:bg-green-900/10';
    if (['payment_sent', 'payout_sent'].includes(type)) return 'bg-blue-50/50 dark:bg-blue-900/10';
    if (type === 'payment_failed') return 'bg-red-50/50 dark:bg-red-900/10';
    if (type === 'boost_activated') return 'bg-purple-50/50 dark:bg-purple-900/10';
    return '';
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { key: NotifTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
    { key: 'payments', label: 'Payments' },
  ];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Notifications" />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-4 font-semibold transition-colors border-b-2 ${
                activeTab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {activeTab === 'payments' ? (
            <>
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No payment notifications yet</p>
              <p className="text-sm mt-1">Deposits, payouts, and boosts will appear here</p>
            </>
          ) : (
            <>
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No notifications yet</p>
              <p className="text-sm mt-1">When you get notifications, they'll show up here</p>
            </>
          )}
        </div>
      ) : (
        <div>
          {notifications.map((n, idx) => (
            <div
              key={n.id}
              ref={idx === notifications.length - 1 ? lastElementRef : null}
              onClick={() => {
                if (n.post_id) navigate(`/post/${n.post_id}`);
                else if (n.from_user_id && !isPaymentType(n.type)) navigate(`/profile/${n.from_user?.username}`);
                else if (isPaymentType(n.type)) navigate('/wallet');
              }}
              className={`border-b border-border p-4 hover:bg-muted/5 cursor-pointer transition-colors ${getNotifBg(n.type)}`}
            >
              <div className="flex gap-3">
                <div className="flex-shrink-0 pt-1">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    {/* Avatar / icon for payment notifs */}
                    {isPaymentType(n.type) ? (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        ['payment_success','deposit_confirmed'].includes(n.type) ? 'bg-green-100 dark:bg-green-900/30' :
                        n.type === 'boost_activated' ? 'bg-purple-100 dark:bg-purple-900/30' :
                        'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <Smartphone className="w-4 h-4 text-green-600" />
                      </div>
                    ) : n.from_user?.avatar_url ? (
                      <img
                        src={n.from_user.avatar_url}
                        alt={n.from_user.username}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {n.from_user?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}

                    <div className="flex-1">
                      {!isPaymentType(n.type) && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-bold">{n.from_user?.username}</span>
                          {n.from_user?.verified && <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />}
                        </div>
                      )}
                      <p className={`text-sm ${isPaymentType(n.type) ? 'font-medium' : 'text-muted-foreground'}`}>
                        {getText(n)}
                      </p>
                      {n.post?.content && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.post.content}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div className="w-2.5 h-2.5 bg-primary rounded-full shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
