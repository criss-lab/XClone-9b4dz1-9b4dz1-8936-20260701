// Well-Known endpoints for federation discovery

export function getWebFinger(handle: string, domain: string) {
  return {
    subject: `acct:${handle}@${domain}`,
    aliases: [`https://${domain}/users/${handle}`],
    links: [
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${domain}/users/${handle}`,
      },
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${domain}/users/${handle}`,
      },
      {
        rel: 'http://ostatus.org/schema/1.0/subscribe',
        template: `https://${domain}/authorize_follow?acct={uri}`,
      },
    ],
  };
}

export function getNodeInfo(domain: string, version: string = '2.1') {
  const protocols = ['activitypub'];
  
  if (version === '2.0') {
    return {
      version: '2.0',
      software: {
        name: 'xclone',
        version: '1.0.0',
      },
      protocols,
      usage: {
        users: {
          total: 0,
          activeMonth: 0,
        },
        localPosts: 0,
      },
      openRegistrations: true,
    };
  }
  
  // 2.1 version
  return {
    version: '2.1',
    software: {
      name: 'xclone',
      version: '1.0.0',
      repository: 'https://github.com/criss-lab/XClone',
    },
    protocols,
    usage: {
      users: {
        total: 0,
        activeMonth: 0,
        activeHalfyear: 0,
      },
      localPosts: 0,
    },
    openRegistrations: true,
  };
}

export function getInstanceInfo(domain: string) {
  return {
    uri: domain,
    title: 'XClone Instance',
    short_description: 'A decentralized social platform',
    description: 'XClone is a federated social network with Bluesky integration',
    email: `admin@${domain}`,
    version: '1.0.0',
    languages: ['en'],
    configuration: {
      urls: {
        streaming_api: `wss://${domain}`,
      },
      statuses: {
        max_characters: 5000,
        max_media_attachments: 4,
      },
      media_attachments: {
        supported_mime_types: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/webm',
          'audio/mpeg',
          'audio/ogg',
        ],
        image_size_limit: 10485760,
        image_matrix_limit: 16777216,
        video_size_limit: 41943040,
        video_matrix_limit: 2304000,
        video_duration_limit: 3600,
      },
      polls: {
        max_options: 4,
        max_characters_per_option: 50,
        min_expiration: 300,
        max_expiration: 2629746,
      },
    },
    urls: {
      streaming_api: `wss://${domain}`,
    },
    stats: {
      user_count: 0,
      status_count: 0,
      domain_count: 0,
    },
    thumbnail: null,
    thumbnail_type: 'image/png',
    languages: ['en'],
    registrations: true,
    approval_required: false,
    invites_enabled: true,
  };
}
