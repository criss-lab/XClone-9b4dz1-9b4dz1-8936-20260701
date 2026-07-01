# Tsocial — Microservices Architecture

## Overview

Tsocial is a scalable, Fediverse-compatible social platform built on a modern microservices architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TSOCIAL ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌────────────────────────────────────────┐  │
│  │   Frontend   │    │         TestagramGateway               │  │
│  │  (XClone)   │◄──►│  API Gateway / Federation Router       │  │
│  │  React SPA  │    │  - Rate limiting                       │  │
│  │  Vite/TS   │    │  - Auth proxy                          │  │
│  └──────────────┘    │  - ActivityPub routing                │  │
│                       │  - WebFinger: /.well-known/webfinger  │  │
│                       │  - Actor: /users/:username            │  │
│                       │  - Inbox: /inbox (shared)             │  │
│                       └────────────────────────────────────────┘  │
│                                          │                        │
│         ┌────────────────────────────────┼──────────────┐         │
│         │                               │               │         │
│  ┌──────▼──────┐  ┌─────────────┐  ┌───▼────────┐  ┌──▼───────┐ │
│  │Testagram    │  │Testagram    │  │Testagram   │  │Testagram │ │
│  │Search       │  │Recommend    │  │Media       │  │Moderation│ │
│  │Full-text    │  │ML ranking   │  │Upload/CDN  │  │Content   │ │
│  │Fediverse    │  │Feed scoring │  │Video trans.│  │Reports   │ │
│  │discovery   │  │User suggest.│  │Storage     │  │Blocks    │ │
│  └─────────────┘  └─────────────┘  └────────────┘  └──────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              OnSpace Cloud (Supabase-compatible)            │  │
│  │  PostgreSQL · Edge Functions · Storage · Auth · Realtime   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Microservices

### 1. XClone (this repo) — Frontend
- React 18 + TypeScript + Vite + Tailwind CSS
- Handles UI, routing, client-side state
- Communicates with all services via REST/Edge Functions

### 2. TestagramGateway
- **Responsibility**: ActivityPub federation routing, rate limiting, auth proxy
- **Key routes**:
  - `GET /.well-known/webfinger` → actor discovery
  - `GET /users/:username` → Actor JSON-LD
  - `POST /inbox` → Incoming activities (Follow, Like, Boost, Create)
  - `GET /users/:username/outbox` → User activities

### 3. TestagramSearch
- Full-text search across posts, users, hashtags
- Fediverse handle lookup (`@user@domain`)
- Trending topic aggregation

### 4. TestagramRecommend
- ML-powered feed ranking
- User suggestion engine
- Content recommendation scoring

### 5. TestagramMedia
- Video upload, transcoding, thumbnail generation
- Image optimization and CDN delivery
- Storage management

### 6. TestagramModeration
- Content flagging and reporting
- Federation blocks (domain/actor level)
- AI-powered content review

## Fediverse (ActivityPub) Flow

```
Mastodon user follows @alice@testagram.site
    ↓
Mastodon → WebFinger → TestagramGateway/.well-known/webfinger
    ↓ returns actor URL
Mastodon → Actor fetch → /users/alice (Activity+JSON)
    ↓ sends Follow activity
Mastodon → POST /inbox → TestagramGateway
    ↓ verifies HTTP signature
Gateway → stores in activitypub_inbox
    ↓ creates federated_followers record
Gateway → sends Accept activity back to Mastodon
    ✅ Federation established
```

## RSA Key Generation

Keys are auto-generated for each user by:
1. **Trigger**: `on_user_profile_activitypub` creates actor record on signup
2. **Edge Function**: `activitypub-keygen` generates RSA-2048 key pair (RSASSA-PKCS1-v1_5/SHA-256)
3. Keys stored in `activitypub_keys` table (private key server-side only)

## Scaling Notes

- Each microservice can be deployed independently (Deno Deploy, Railway, Fly.io)
- TestagramGateway handles all federation traffic — scale this first under load
- Use Redis/Upstash for rate limiting in Gateway
- Media service should use object storage (S3/R2) for video/image assets
- Recommend service can move to dedicated ML infrastructure as user base grows
