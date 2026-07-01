import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface MastodonBridgeProps {
  onConnect?: (handle: string, instance: string) => Promise<void>;
}

const MastodonBridge: React.FC<MastodonBridgeProps> = ({ onConnect }) => {
  const [handle, setHandle] = useState('');
  const [instance, setInstance] = useState('mastodon.social');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  const handleVerify = async () => {
    if (!handle || !instance) {
      toast.error('Please enter handle and instance');
      return;
    }

    setLoading(true);
    try {
      // Verify Mastodon account via WebFinger
      const response = await fetch(`https://${instance}/.well-known/webfinger?resource=acct:${handle}@${instance}`);
      if (!response.ok) {
        throw new Error('Account not found');
      }

      // Get account info
      const accountResponse = await fetch(`https://${instance}/api/v1/accounts/search?q=${handle}`);
      const accounts = await accountResponse.json();
      if (accounts.length > 0) {
        const account = accounts[0];
        setFollowers(account.followers_count || 0);
        setFollowing(account.following_count || 0);
      }

      setVerified(true);
      if (onConnect) {
        await onConnect(handle, instance);
      }
      toast.success(`Connected to ${handle}@${instance}!`);
    } catch (error) {
      toast.error('Failed to verify Mastodon account');
      console.error(error);
      setVerified(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🐘</span>
          Mastodon Bridge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {verified ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900 dark:text-green-100">
                  Connected to {handle}@{instance}
                </p>
                <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                  Your content will be federated to this Mastodon account
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Followers</p>
                <p className="text-2xl font-bold">{followers.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Following</p>
                <p className="text-2xl font-bold">{following.toLocaleString()}</p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setVerified(false);
                setHandle('');
              }}
            >
              Change Account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Connect your Mastodon account to enable ActivityPub federation
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Handle</label>
              <Input
                placeholder="username"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Instance</label>
              <Input
                placeholder="mastodon.social"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
              />
            </div>

            <Button onClick={handleVerify} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Connect'
              )}
            </Button>

            <a
              href="https://joinmastodon.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Don't have a Mastodon account? <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MastodonBridge;
