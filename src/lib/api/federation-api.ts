import { federationConfig } from '@/lib/config/federation';
import crypto from 'crypto';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  includeSignature?: boolean;
}

interface FederationResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class FederationAPI {
  private static generateSignature(path: string, body?: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const host = new URL(federationConfig.instanceUrl).hostname;
    const method = 'POST';

    const signingString = [
      `(request-target): ${method.toLowerCase()} ${path}`,
      `host: ${host}`,
      `date: ${new Date().toUTCString()}`,
      ...(body ? [`digest: SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}`] : []),
    ].join('\n');

    // In production, use actual RSA signing
    const hmac = crypto
      .createHmac('sha256', federationConfig.secret)
      .update(signingString)
      .digest('base64');

    return `keyId="${federationConfig.instanceUrl}#main-key",algorithm="hmac-sha256",headers="(request-target) host date${body ? ' digest' : ''}",signature="${hmac}"`;
  }

  /**
   * Send a request to another federation instance
   */
  static async sendToInstance(
    targetUrl: string,
    path: string,
    payload: any,
    options: RequestOptions = {}
  ): Promise<FederationResponse> {
    try {
      const body = JSON.stringify(payload);
      const signature = this.generateSignature(path, body);

      const response = await fetch(`${targetUrl}${path}`, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/ld+json',
          'Accept': 'application/activity+json',
          'User-Agent': `${federationConfig.instanceName}/1.0`,
          'Signature': signature,
          ...(options.headers || {}),
        },
        body,
      });

      const data = await response.json();

      return {
        success: response.ok,
        data,
        status: response.status,
      };
    } catch (error) {
      console.error('Federation API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 500,
      };
    }
  }

  /**
   * Get .well-known/webfinger data
   */
  static async getWebFinger(handle: string, instance: string): Promise<FederationResponse> {
    try {
      const response = await fetch(`https://${instance}/.well-known/webfinger?resource=acct:${handle}@${instance}`);
      const data = await response.json();

      return {
        success: response.ok,
        data,
        status: response.status,
      };
    } catch (error) {
      console.error('WebFinger error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebFinger lookup failed',
        status: 500,
      };
    }
  }

  /**
   * Get instance information
   */
  static async getInstanceInfo(instance: string): Promise<FederationResponse> {
    try {
      const response = await fetch(`https://${instance}/api/v1/instance`);
      const data = await response.json();

      return {
        success: response.ok,
        data,
        status: response.status,
      };
    } catch (error) {
      console.error('Instance info error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get instance info',
        status: 500,
      };
    }
  }

  /**
   * Verify HTTP Signature
   */
  static verifySignature(headers: Record<string, string>, body?: string): boolean {
    try {
      const signature = headers['signature'];
      if (!signature) return false;

      // Parse signature header
      const match = signature.match(
        /keyId="([^"]+)",algorithm="([^"]+)",headers="([^"]+)",signature="([^"]+)"/
      );
      if (!match) return false;

      const [, keyId, algorithm, headerNames, sig] = match;
      const headers_array = headerNames.split(' ');

      // Reconstruct signing string
      const signingString = headers_array
        .map((header) => {
          if (header === '(request-target)') {
            return '(request-target): post /inbox';
          }
          return `${header}: ${headers[header]}`;
        })
        .join('\n');

      // Verify (simplified - in production, fetch public key from keyId)
      const hmac = crypto
        .createHmac('sha256', federationConfig.secret)
        .update(signingString)
        .digest('base64');

      return hmac === sig;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }
}

export default FederationAPI;
