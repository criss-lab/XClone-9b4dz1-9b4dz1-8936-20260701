import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { mapSupabaseUser } from '@/lib/auth';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Added only to fix build error.
 * Original logic preserved.
 */
export async function sendActivityNotification({
  recipientUserId,
  title,
  body,
  data,
}: {
  recipientUserId: string;
  title: string;
  body: string;
  data?: any;
}) {
  try {
    // Insert notification into database
    await supabase.from('notifications').insert({
      user_id: recipientUserId,
      type: data?.type || 'activity',
      title,
      body,
      post_id: data?.postId || null,
      from_user_id: data?.fromUserId || null,
      data,
    });

    console.log('[Push] Activity notification saved');
  } catch (error) {
    console.error('[Push] Failed to send activity notification:', error);
  }
}

async function registerPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[Push] Permission denied');
      return;
    }

    // Register with FCM
    await PushNotifications.register();

    // Listen for FCM token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] FCM token:', token.value);

      // Upsert token to Supabase
      await supabase.from('fcm_tokens').upsert(
        {
          user_id: userId,
          token: token.value,
          platform: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration error:', error);
    });

    // Handle foreground notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Received:', notification);
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Push] Action performed:', action);

      const data = action.notification.data;
      if (data?.route) {
        window.location.href = data.route;
      }
    });
  } catch (err) {
    console.error('[Push] Setup error:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { login, logout, setLoading } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session?.user) {
        const mappedUser = mapSupabaseUser(session.user);
        login(mappedUser);

        // Original logic preserved
        registerPushNotifications(session.user.id);
      }

      if (mounted) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        const mappedUser = mapSupabaseUser(session.user);
        login(mappedUser);
        setLoading(false);

        // Original logic preserved
        registerPushNotifications(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        logout();
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        login(mapSupabaseUser(session.user));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [login, logout, setLoading]);

  return <>{children}</>;
}
