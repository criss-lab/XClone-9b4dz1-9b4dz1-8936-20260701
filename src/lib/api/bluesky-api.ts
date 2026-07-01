import { federationConfig } from '@/lib/config/federation';

export interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BlueskyResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class BlueskyAPI {
  private session: BlueskySession | null = null;

  async init(): Promise<boolean> {
    if (!federationConfig.bluesky.enabled) {
      console.warn('Bluesky integration is disabled');
      return false;
    }

    try {
      await this.createSession(
        federationConfig.bluesky.handle,
        federationConfig.bluesky.password
      );
      return true;
    } catch (error) {
      console.error('Failed to initialize Bluesky:', error);
      return false;
    }
  }

  private async createSession(handle: string, password: string): Promise<BlueskySession> {
    const response = await fetch(`${federationConfig.bluesky.apiUrl}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier: handle, password }),
    });

    if (!response.ok) {
      throw new Error(`Bluesky auth failed: ${response.statusText}`);
    }

    this.session = await response.json();
    return this.session;
  }

  private async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<BlueskyResponse<T>> {
    if (!this.session) {
      return {
        success: false,
        error: 'Not authenticated with Bluesky',
        status: 401,
      };
    }

    try {
      const response = await fetch(`${federationConfig.bluesky.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.accessJwt}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      return {
        success: response.ok,
        data,
        status: response.status,
      };
    } catch (error) {
      console.error('Bluesky API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bluesky API error',
        status: 500,
      };
    }
  }

  async createPost(text: string, facets?: any[], embed?: any): Promise<BlueskyResponse> {
    return this.request('/com.atproto.repo.createRecord', 'POST', {
      repo: this.session?.did,
      collection: 'app.bsky.feed.post',
      record: {
        text,
        facets,
        embed,
        createdAt: new Date().toISOString(),
      },
    });
  }

  async likePost(postUri: string, postCid: string): Promise<BlueskyResponse> {
    return this.request('/com.atproto.repo.createRecord', 'POST', {
      repo: this.session?.did,
      collection: 'app.bsky.feed.like',
      record: {
        subject: { uri: postUri, cid: postCid },
        createdAt: new Date().toISOString(),
      },
    });
  }

  async repostPost(postUri: string, postCid: string): Promise<BlueskyResponse> {
    return this.request('/com.atproto.repo.createRecord', 'POST', {
      repo: this.session?.did,
      collection: 'app.bsky.feed.repost',
      record: {
        subject: { uri: postUri, cid: postCid },
        createdAt: new Date().toISOString(),
      },
    });
  }

  async searchPosts(query: string, limit: number = 20): Promise<BlueskyResponse> {
    return this.request(`/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async getHomeFeed(limit: number = 30, cursor?: string): Promise<BlueskyResponse> {
    const url = `/app.bsky.feed.getTimeline?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
    return this.request(url);
  }

  async getProfile(handle: string): Promise<BlueskyResponse> {
    return this.request(`/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
  }

  async followUser(did: string): Promise<BlueskyResponse> {
    return this.request('/com.atproto.repo.createRecord', 'POST', {
      repo: this.session?.did,
      collection: 'app.bsky.graph.follow',
      record: {
        subject: did,
        createdAt: new Date().toISOString(),
      },
    });
  }

  isAuthenticated(): boolean {
    return !!this.session;
  }
}

export default BlueskyAPI;
