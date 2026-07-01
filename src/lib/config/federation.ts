// Federation Configuration

export const federationConfig = {
  // Instance Settings
  enabled: import.meta.env.VITE_FEDERATION_ENABLED === 'true',
  instanceUrl: import.meta.env.VITE_INSTANCE_URL || 'http://localhost:5173',
  instanceName: import.meta.env.VITE_INSTANCE_NAME || 'XClone Instance',
  adminEmail: import.meta.env.VITE_INSTANCE_ADMIN_EMAIL || 'admin@localhost',
  description: import.meta.env.VITE_INSTANCE_DESCRIPTION || '',

  // Keys
  privateKey: import.meta.env.VITE_FEDERATION_PRIVATE_KEY || '',
  publicKey: import.meta.env.VITE_FEDERATION_PUBLIC_KEY || '',
  secret: import.meta.env.VITE_FEDERATION_SECRET || 'your-secret-key',

  // Bluesky
  bluesky: {
    enabled: import.meta.env.VITE_BLUESKY_ENABLED === 'true',
    handle: import.meta.env.VITE_BLUESKY_HANDLE || '',
    password: import.meta.env.VITE_BLUESKY_PASSWORD || '',
    apiUrl: import.meta.env.VITE_BLUESKY_API_URL || 'https://bsky.social/xrpc',
  },

  // Mastodon
  mastodon: {
    enabled: import.meta.env.VITE_MASTODON_ENABLED === 'true',
    instance: import.meta.env.VITE_MASTODON_INSTANCE || 'mastodon.social',
    accessToken: import.meta.env.VITE_MASTODON_ACCESS_TOKEN || '',
  },

  // Lemmy
  lemmy: {
    enabled: import.meta.env.VITE_LEMMY_ENABLED === 'true',
    instance: import.meta.env.VITE_LEMMY_INSTANCE || 'lemmy.ml',
    apiToken: import.meta.env.VITE_LEMMY_API_TOKEN || '',
  },

  // Cross-Instance
  gateway: {
    url: import.meta.env.VITE_TESTAGRAM_GATEWAY_URL || 'http://localhost:3000',
    secret: import.meta.env.VITE_TESTAGRAM_GATEWAY_SECRET || '',
  },
  xcloneSecret: import.meta.env.VITE_XCLONE_API_SECRET || '',
};

export default federationConfig;
