import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Deprecated: ActivityPub inbox function has been moved to TestagramGateway.
// This function now returns 410 Gone and a message directing users to the gateway.

serve(() => {
  return new Response(JSON.stringify({
    error: 'Deprecated: ActivityPub inbox endpoint moved to TestagramGateway. Please use your configured GATEWAY.'
  }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
