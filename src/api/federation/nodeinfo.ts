// NodeInfo Endpoint
// Provides information about the instance

import { supabase } from '@/lib/supabase';
import { federationConfig } from '@/lib/config/federation';

export interface NodeInfoResponse {
  version: string;
  software: {
    name: string;
    version: string;
    repository?: string;
  };
  protocols: string[];
  usage: {
    users: {
      total: number;
      activeMonth?: number;
      activeHalfyear?: number;
    };
    localPosts: number;
  };
  openRegistrations: boolean;
}

export async function getNodeInfo(version: string = '2.1'): Promise<NodeInfoResponse> {
  // Get stats from database
  const { count: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });

  const { count: totalPosts } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true });

  const baseResponse = {
    software: {
      name: 'xclone',
      version: '1.0.0',
      repository: 'https://github.com/criss-lab/XClone',
    },
    protocols: ['activitypub', 'mastodon_api'],
    usage: {
      users: {
        total: totalUsers || 0,
        activeMonth: totalUsers ? Math.floor(totalUsers * 0.6) : 0,
        activeHalfyear: totalUsers ? Math.floor(totalUsers * 0.8) : 0,
      },
      localPosts: totalPosts || 0,
    },
    openRegistrations: true,
  };

  if (version === '2.0') {
    return {
      version: '2.0',
      ...baseResponse,
    } as NodeInfoResponse;
  }

  return {
    version: '2.1',
    ...baseResponse,
  } as NodeInfoResponse;
}

export interface InstanceInfoResponse {
  uri: string;
  title: string;
  short_description: string;
  description: string;
  email: string;
  version: string;
  languages: string[];
  configuration: {
    urls: {
      streaming_api: string;
    };
    statuses: {
      max_characters: number;
      max_media_attachments: number;
    };
    media_attachments: {
      supported_mime_types: string[];
      image_size_limit: number;
      image_matrix_limit: number;
      video_size_limit: number;
      video_matrix_limit: number;
      video_duration_limit: number;
    };
    polls: {
      max_options: number;
      max_characters_per_option: number;
      min_expiration: number;
      max_expiration: number;
    };
  };
  urls: {
    streaming_api: string;
  };
  stats: {
    user_count: number;
    status_count: number;
    domain_count: number;
  };
  thumbnail: string | null;
  languages: string[];
  registrations: boolean;
  approval_required: boolean;
}

export async function getInstanceInfo(): Promise<InstanceInfoResponse> {
  const { count: userCount } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });

  const { count: postCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true });

  const domain = new URL(federationConfig.instanceUrl).hostname;

  return {
    uri: domain,
    title: federationConfig.instanceName,
    short_description: federationConfig.description.substring(0, 100),
    description: federationConfig.description,
    email: federationConfig.adminEmail,
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
      user_count: userCount || 0,
      status_count: postCount || 0,
      domain_count: 1,
    },
    thumbnail: null,
    languages: ['en'],
    registrations: true,
    approval_required: false,
  };
}
