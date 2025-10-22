---
title: Session Management
description: Manage user sessions with Lix Cache
---

Use Lix Cache to store and manage user sessions with automatic expiration, perfect for web applications.

## Basic Session Storage

### Simple Session Store

```typescript
import { LixCache } from 'lix-cache-sdk';
import { randomUUID } from 'crypto';

const cache = new LixCache();

interface Session {
  userId: string;
  username: string;
  email: string;
  createdAt: number;
  lastAccess: number;
}

class SessionStore {
  private readonly TTL = 3600; // 1 hour

  async create(userId: string, data: Omit<Session, 'createdAt' | 'lastAccess'>): Promise<string> {
    const sessionId = randomUUID();
    const session: Session = {
      ...data,
      createdAt: Date.now(),
      lastAccess: Date.now()
    };

    await cache.set(`session:${sessionId}`, session, { ttl: this.TTL });

    return sessionId;
  }

  async get(sessionId: string): Promise<Session | null> {
    const session = await cache.get<Session>(`session:${sessionId}`);

    if (session) {
      // Update last access time
      session.lastAccess = Date.now();
      await cache.set(`session:${sessionId}`, session, { ttl: this.TTL });
    }

    return session;
  }

  async delete(sessionId: string): Promise<void> {
    await cache.delete(`session:${sessionId}`);
  }

  async refresh(sessionId: string): Promise<boolean> {
    const session = await cache.get<Session>(`session:${sessionId}`);

    if (!session) return false;

    // Extend TTL
    await cache.set(`session:${sessionId}`, session, { ttl: this.TTL });

    return true;
  }
}

// Usage
const sessions = new SessionStore();

// Create session after login
const sessionId = await sessions.create('user-123', {
  userId: 'user-123',
  username: 'alice',
  email: 'alice@example.com'
});

// Get session
const session = await sessions.get(sessionId);

// Delete session (logout)
await sessions.delete(sessionId);
```

## Express Middleware

### Session Middleware

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
app.use(cookieParser());

// Session middleware
app.use(async (req, res, next) => {
  const sessionId = req.cookies.sessionId;

  if (sessionId) {
    const session = await sessions.get(sessionId);

    if (session) {
      // Attach session to request
      req.session = session;
    } else {
      // Invalid/expired session
      res.clearCookie('sessionId');
    }
  }

  next();
});

// Login route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  // Validate credentials (example)
  const user = await validateCredentials(username, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create session
  const sessionId = await sessions.create(user.id, {
    userId: user.id,
    username: user.username,
    email: user.email
  });

  // Set cookie
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  });

  res.json({ message: 'Login successful' });
});

// Logout route
app.post('/api/logout', async (req, res) => {
  const sessionId = req.cookies.sessionId;

  if (sessionId) {
    await sessions.delete(sessionId);
    res.clearCookie('sessionId');
  }

  res.json({ message: 'Logout successful' });
});

// Protected route
app.get('/api/profile', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    userId: req.session.userId,
    username: req.session.username,
    email: req.session.email
  });
});
```

## Type-Safe Sessions with Zod

```typescript
import { z } from 'zod';

const SessionSchema = z.object({
  userId: z.string(),
  username: z.string(),
  email: z.string().email(),
  roles: z.array(z.string()),
  createdAt: z.number(),
  lastAccess: z.number(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

type Session = z.infer<typeof SessionSchema>;

// Create validated collection
const sessions = cache.collection<Session>('session:', SessionSchema);

// All operations are validated!
await sessions.set('abc123', {
  userId: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  roles: ['user', 'admin'],
  createdAt: Date.now(),
  lastAccess: Date.now()
});
```

## Advanced Session Features

### Sliding Window Expiration

Automatically extend session on activity:

```typescript
class SlidingSessionStore {
  private readonly TTL = 3600; // 1 hour
  private readonly IDLE_TIMEOUT = 1800; // 30 minutes

  async get(sessionId: string): Promise<Session | null> {
    const session = await cache.get<Session>(`session:${sessionId}`);

    if (!session) return null;

    const now = Date.now();
    const timeSinceLastAccess = (now - session.lastAccess) / 1000;

    // Check idle timeout
    if (timeSinceLastAccess > this.IDLE_TIMEOUT) {
      await this.delete(sessionId);
      return null;
    }

    // Update last access and extend TTL
    session.lastAccess = now;
    await cache.set(`session:${sessionId}`, session, { ttl: this.TTL });

    return session;
  }
}
```

### Remember Me Feature

Long-lived sessions for "Remember Me" functionality:

```typescript
interface RememberMeToken {
  userId: string;
  createdAt: number;
}

async function createRememberMeToken(userId: string): Promise<string> {
  const token = randomUUID();
  const data: RememberMeToken = {
    userId,
    createdAt: Date.now()
  };

  // 30 days TTL
  await cache.set(`remember:${token}`, data, { ttl: 2592000 });

  return token;
}

async function validateRememberMeToken(token: string): Promise<string | null> {
  const data = await cache.get<RememberMeToken>(`remember:${token}`);

  if (!data) return null;

  // Check if token is too old (30 days)
  const age = Date.now() - data.createdAt;
  if (age > 2592000000) {
    await cache.delete(`remember:${token}`);
    return null;
  }

  return data.userId;
}

// Login with "Remember Me"
app.post('/api/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;

  const user = await validateCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create regular session
  const sessionId = await sessions.create(user.id, user);

  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  });

  // Create remember-me token if requested
  if (rememberMe) {
    const rememberToken = await createRememberMeToken(user.id);

    res.cookie('rememberMe', rememberToken, {
      httpOnly: true,
      secure: true,
      maxAge: 2592000000 // 30 days
    });
  }

  res.json({ message: 'Login successful' });
});

// Auto-login with remember-me token
app.use(async (req, res, next) => {
  // Skip if already has session
  if (req.session) return next();

  const rememberToken = req.cookies.rememberMe;
  if (!rememberToken) return next();

  const userId = await validateRememberMeToken(rememberToken);
  if (!userId) {
    res.clearCookie('rememberMe');
    return next();
  }

  // Load user and create new session
  const user = await loadUser(userId);
  const sessionId = await sessions.create(userId, user);

  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    maxAge: 3600000
  });

  req.session = await sessions.get(sessionId);
  next();
});
```

### Multi-Device Sessions

Track sessions across multiple devices:

```typescript
interface DeviceSession extends Session {
  deviceId: string;
  deviceName: string;
  lastIP: string;
}

class MultiDeviceSessionStore {
  async create(userId: string, device: { id: string; name: string; ip: string }): Promise<string> {
    const sessionId = randomUUID();
    const session: DeviceSession = {
      userId,
      deviceId: device.id,
      deviceName: device.name,
      lastIP: device.ip,
      createdAt: Date.now(),
      lastAccess: Date.now()
    };

    // Store session
    await cache.set(`session:${sessionId}`, session, { ttl: 3600 });

    // Track user's active sessions
    const userSessions: string[] = await cache.get(`user:${userId}:sessions`) || [];
    userSessions.push(sessionId);
    await cache.set(`user:${userId}:sessions`, userSessions, { ttl: 86400 });

    return sessionId;
  }

  async getUserSessions(userId: string): Promise<DeviceSession[]> {
    const sessionIds: string[] = await cache.get(`user:${userId}:sessions`) || [];

    const sessions = await Promise.all(
      sessionIds.map(id => cache.get<DeviceSession>(`session:${id}`))
    );

    // Filter out expired sessions
    return sessions.filter((s): s is DeviceSession => s !== null);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    const sessionIds: string[] = await cache.get(`user:${userId}:sessions`) || [];

    // Delete all sessions
    await Promise.all(sessionIds.map(id => cache.delete(`session:${id}`)));

    // Clear session list
    await cache.delete(`user:${userId}:sessions`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await cache.get<DeviceSession>(`session:${sessionId}`);

    if (session) {
      // Remove from user's session list
      const userSessions: string[] = await cache.get(`user:${session.userId}:sessions`) || [];
      const filtered = userSessions.filter(id => id !== sessionId);
      await cache.set(`user:${session.userId}:sessions`, filtered, { ttl: 86400 });
    }

    await cache.delete(`session:${sessionId}`);
  }
}

// Usage: View active sessions
app.get('/api/sessions', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const sessions = await multiDeviceSessions.getUserSessions(req.session.userId);

  res.json({
    sessions: sessions.map(s => ({
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      lastIP: s.lastIP,
      lastAccess: new Date(s.lastAccess).toISOString(),
      current: s.deviceId === req.session.deviceId
    }))
  });
});

// Usage: Revoke specific session
app.delete('/api/sessions/:sessionId', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  await multiDeviceSessions.deleteSession(req.params.sessionId);

  res.json({ message: 'Session revoked' });
});

// Usage: Revoke all sessions (logout everywhere)
app.post('/api/logout-all', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  await multiDeviceSessions.deleteAllUserSessions(req.session.userId);

  res.clearCookie('sessionId');
  res.json({ message: 'Logged out from all devices' });
});
```

## Security Features

### IP Validation

Prevent session hijacking by validating IP address:

```typescript
class SecureSessionStore {
  async create(userId: string, ip: string): Promise<string> {
    const sessionId = randomUUID();
    const session = {
      userId,
      ip,
      createdAt: Date.now(),
      lastAccess: Date.now()
    };

    await cache.set(`session:${sessionId}`, session, { ttl: 3600 });

    return sessionId;
  }

  async get(sessionId: string, currentIP: string): Promise<Session | null> {
    const session = await cache.get<Session & { ip: string }>(`session:${sessionId}`);

    if (!session) return null;

    // Validate IP matches
    if (session.ip !== currentIP) {
      console.warn(`IP mismatch for session ${sessionId}`);
      await this.delete(sessionId);
      return null;
    }

    return session;
  }
}

// Middleware
app.use(async (req, res, next) => {
  const sessionId = req.cookies.sessionId;
  const clientIP = req.ip || req.connection.remoteAddress;

  if (sessionId) {
    const session = await secureSessionStore.get(sessionId, clientIP);

    if (session) {
      req.session = session;
    } else {
      res.clearCookie('sessionId');
    }
  }

  next();
});
```

### CSRF Protection

Store CSRF tokens in sessions:

```typescript
interface SessionWithCSRF extends Session {
  csrfToken: string;
}

async function createSessionWithCSRF(userId: string): Promise<{ sessionId: string; csrfToken: string }> {
  const sessionId = randomUUID();
  const csrfToken = randomUUID();

  const session: SessionWithCSRF = {
    userId,
    csrfToken,
    createdAt: Date.now(),
    lastAccess: Date.now()
  };

  await cache.set(`session:${sessionId}`, session, { ttl: 3600 });

  return { sessionId, csrfToken };
}

// Validate CSRF token
function validateCSRF(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') return next();

  const session = req.session as SessionWithCSRF;
  const token = req.headers['x-csrf-token'] || req.body.csrfToken;

  if (!session || !token || session.csrfToken !== token) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

app.use(validateCSRF);
```

### Concurrent Login Prevention

Invalidate old sessions when user logs in again:

```typescript
async function createExclusiveSession(userId: string): Promise<string> {
  // Get user's existing sessions
  const existingSessions: string[] = await cache.get(`user:${userId}:sessions`) || [];

  // Delete all existing sessions
  await Promise.all(existingSessions.map(id => cache.delete(`session:${id}`)));

  // Create new session
  const sessionId = randomUUID();
  const session = {
    userId,
    createdAt: Date.now(),
    lastAccess: Date.now()
  };

  await cache.set(`session:${sessionId}`, session, { ttl: 3600 });
  await cache.set(`user:${userId}:sessions`, [sessionId], { ttl: 3600 });

  return sessionId;
}
```

## Session Analytics

### Track Session Metrics

```typescript
interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  averageSessionLength: number;
  uniqueUsers: number;
}

async function getSessionMetrics(): Promise<SessionMetrics> {
  // Scan all sessions
  const result = await cache.scan({ prefix: 'session:' });

  const sessions = result.items.map(item => item.value as Session);

  const now = Date.now();
  const activeSessions = sessions.filter(s => {
    const idleTime = (now - s.lastAccess) / 1000;
    return idleTime < 300; // Active in last 5 minutes
  });

  const sessionLengths = sessions.map(s => now - s.createdAt);
  const avgLength = sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;

  const uniqueUsers = new Set(sessions.map(s => s.userId)).size;

  return {
    totalSessions: sessions.length,
    activeSessions: activeSessions.length,
    averageSessionLength: avgLength,
    uniqueUsers
  };
}

// Endpoint to view metrics
app.get('/api/admin/sessions/metrics', async (req, res) => {
  const metrics = await getSessionMetrics();

  res.json(metrics);
});
```

## Testing Sessions

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Session management', () => {
  let sessions: SessionStore;

  beforeEach(() => {
    sessions = new SessionStore();
  });

  it('creates and retrieves session', async () => {
    const sessionId = await sessions.create('user-1', {
      userId: 'user-1',
      username: 'alice',
      email: 'alice@example.com'
    });

    const session = await sessions.get(sessionId);

    expect(session).toBeDefined();
    expect(session?.userId).toBe('user-1');
    expect(session?.username).toBe('alice');
  });

  it('returns null for expired session', async () => {
    const sessionId = 'expired-session-id';

    const session = await sessions.get(sessionId);

    expect(session).toBeNull();
  });

  it('deletes session on logout', async () => {
    const sessionId = await sessions.create('user-1', {
      userId: 'user-1',
      username: 'alice',
      email: 'alice@example.com'
    });

    await sessions.delete(sessionId);

    const session = await sessions.get(sessionId);
    expect(session).toBeNull();
  });

  it('updates last access time', async () => {
    const sessionId = await sessions.create('user-1', {
      userId: 'user-1',
      username: 'alice',
      email: 'alice@example.com'
    });

    const session1 = await sessions.get(sessionId);
    const lastAccess1 = session1!.lastAccess;

    await new Promise(resolve => setTimeout(resolve, 100));

    const session2 = await sessions.get(sessionId);
    const lastAccess2 = session2!.lastAccess;

    expect(lastAccess2).toBeGreaterThan(lastAccess1);
  });
});
```

## Best Practices

### 1. Use Secure Cookies

```typescript
// ✅ Good: Secure cookie settings
res.cookie('sessionId', sessionId, {
  httpOnly: true,    // Prevent XSS
  secure: true,      // HTTPS only
  sameSite: 'strict',// CSRF protection
  maxAge: 3600000    // 1 hour
});

// ❌ Bad: Insecure cookies
res.cookie('sessionId', sessionId);
```

### 2. Set Appropriate TTLs

```typescript
// ✅ Good: Reasonable TTL
const TTL = 3600; // 1 hour

// ❌ Bad: Too long
const TTL = 2592000; // 30 days - use remember-me tokens instead!
```

### 3. Clean Up Expired Sessions

```typescript
// Periodically clean up expired sessions
setInterval(async () => {
  const result = await cache.scan({ prefix: 'session:' });

  const now = Date.now();
  for (const item of result.items) {
    const session = item.value as Session;
    const age = (now - session.lastAccess) / 1000;

    if (age > 7200) { // 2 hours idle
      await cache.delete(item.key);
    }
  }
}, 3600000); // Run every hour
```

## Next Steps

- [Rate Limiting](/examples/rate-limiting/) - Protect session endpoints
- [Database Caching](/examples/database-caching/) - Cache user data
- [Error Handling](/guides/errors/) - Handle session errors gracefully
