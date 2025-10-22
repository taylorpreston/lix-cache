---
title: React Integration
description: Use Lix Cache with React applications
---

Lix Cache works great with React out of the box. Automatic batching and request deduplication make it perfect for component-based UIs.

## Quick Start

```typescript
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cache.remember(
      `user:${userId}`,
      async () => {
        const res = await fetch(`/api/users/${userId}`);
        return res.json();
      },
      { ttl: 300 }
    ).then(data => {
      setUser(data);
      setLoading(false);
    });
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

## Automatic Batching in React

React's render cycle naturally batches cache operations:

```typescript
function Dashboard() {
  return (
    <div>
      <UserCard userId="1" />     {/* cache.get('user:1') */}
      <UserPosts userId="1" />    {/* cache.get('posts:1') */}
      <UserFollowers userId="1" />{/* cache.get('followers:1') */}
    </div>
  );
}

// All 3 components render in same tick
// Result: 3 cache operations → 1 HTTP request!
```

## Recommended Pattern: React Query

For production React apps, we recommend using [React Query](https://tanstack.com/query) (TanStack Query) with Lix Cache:

```bash
pnpm add @tanstack/react-query
```

```typescript
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { LixCache } from 'lix-cache-sdk';

const cache = new LixCache();
const queryClient = new QueryClient();

// Wrapper component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

// Use in components
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => cache.remember(
      `user:${userId}`,
      async () => {
        const res = await fetch(`/api/users/${userId}`);
        return res.json();
      },
      { ttl: 300 }
    )
  });

  if (isLoading) return <div>Loading...</div>;
  return <div>{data.name}</div>;
}
```

### Why React Query + Lix Cache?

✅ **React Query** handles:
- React lifecycle management
- Loading states
- Error handling
- Refetching
- Cache invalidation
- Optimistic updates

✅ **Lix Cache** handles:
- Server-side caching
- Cross-client caching
- Deduplication across all users
- Persistence

## Custom Hook Pattern

Create reusable hooks:

```typescript
// hooks/useCache.ts
import { useState, useEffect } from 'react';
import { cache } from './cache';

export function useCache<T>(key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    cache.get<T>(key)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [key]);

  return { data, loading, error };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading } = useCache<User>(`user:${userId}`);

  if (loading) return <div>Loading...</div>;
  return <div>{user?.name}</div>;
}
```

## Server-Side Rendering (Next.js)

### App Router (Next.js 13+)

```typescript
// app/users/[id]/page.tsx
import { cache } from '@/lib/cache';

export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await cache.remember(
    `user:${params.id}`,
    async () => {
      const res = await fetch(`https://api.example.com/users/${params.id}`);
      return res.json();
    },
    { ttl: 300 }
  );

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

### Pages Router (Next.js 12)

```typescript
// pages/users/[id].tsx
import { GetServerSideProps } from 'next';
import { cache } from '@/lib/cache';

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const user = await cache.remember(
    `user:${params?.id}`,
    async () => {
      const res = await fetch(`https://api.example.com/users/${params?.id}`);
      return res.json();
    },
    { ttl: 300 }
  );

  return { props: { user } };
};

export default function UserPage({ user }) {
  return <div>{user.name}</div>;
}
```

## Real-World Patterns

### Prefetching on Hover

```typescript
function UserLink({ userId, children }) {
  const prefetch = () => {
    cache.remember(
      `user:${userId}`,
      () => fetch(`/api/users/${userId}`).then(r => r.json()),
      { ttl: 60 }
    );
  };

  return (
    <Link
      to={`/users/${userId}`}
      onMouseEnter={prefetch}
    >
      {children}
    </Link>
  );
}
```

### Optimistic Updates

```typescript
async function updateUser(userId: string, data: Partial<User>) {
  // Update cache optimistically
  const current = await cache.get<User>(`user:${userId}`);
  await cache.set(`user:${userId}`, { ...current, ...data });

  try {
    // Update on server
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  } catch (error) {
    // Revert on error
    await cache.set(`user:${userId}`, current);
    throw error;
  }
}
```

### Infinite Scroll

```typescript
function PostList() {
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    cache.remember(
      `posts:page:${page}`,
      async () => {
        const res = await fetch(`/api/posts?page=${page}`);
        return res.json();
      },
      { ttl: 300 }
    ).then(newPosts => {
      setPosts(prev => [...prev, ...newPosts]);
    });
  }, [page]);

  return (
    <div>
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      <button onClick={() => setPage(p => p + 1)}>Load More</button>
    </div>
  );
}
```

### Form Data Persistence

```typescript
function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '' });

  // Load from cache on mount
  useEffect(() => {
    cache.get<typeof formData>('form:contact').then(cached => {
      if (cached) setFormData(cached);
    });
  }, []);

  // Save to cache on change
  const handleChange = (field: string, value: string) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    cache.set('form:contact', updated, { ttl: 3600 });
  };

  const handleSubmit = async () => {
    await submitForm(formData);
    cache.delete('form:contact'); // Clear after submit
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={e => handleChange('name', e.target.value)}
      />
      <input
        value={formData.email}
        onChange={e => handleChange('email', e.target.value)}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Performance Tips

### 1. Use Collections for Related Data

```typescript
const users = cache.collection<User>('user:');

function UserList({ userIds }) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // Batched automatically!
    users.batchGet(userIds).then(setUsers);
  }, [userIds]);

  return users.map(user => <UserCard key={user.id} user={user} />);
}
```

### 2. Avoid Waterfalls

```typescript
// ❌ Bad: Sequential (waterfall)
const user = await cache.get('user:1');
const posts = await cache.get(`posts:${user.id}`);

// ✅ Good: Parallel
const [user, posts] = await Promise.all([
  cache.get('user:1'),
  cache.get('posts:1')
]);
```

### 3. Use Remember for API Calls

```typescript
// ❌ Bad: No caching
const res = await fetch('/api/user');
const user = await res.json();

// ✅ Good: Cached with remember
const user = await cache.remember(
  'user:current',
  async () => {
    const res = await fetch('/api/user');
    return res.json();
  },
  { ttl: 300 }
);
```

## Debugging

Enable logging to see batching in action:

```typescript
const cache = new LixCache({
  url: 'http://localhost:4000'
});

// Add logging
const originalBatch = cache.batch.bind(cache);
cache.batch = async (ops) => {
  console.log(`[Cache] Batching ${ops.length} operations:`, ops);
  return originalBatch(ops);
};
```

## Common Patterns

### Loading States

```typescript
function UserProfile({ userId }) {
  const { data, loading } = useCache(`user:${userId}`);

  if (loading) return <Skeleton />;
  if (!data) return <NotFound />;
  return <Profile user={data} />;
}
```

### Error Boundaries

```typescript
function ErrorBoundary({ children }) {
  return (
    <ErrorBoundaryComponent
      fallback={<ErrorFallback />}
      onError={(error) => {
        console.error('Cache error:', error);
      }}
    >
      {children}
    </ErrorBoundaryComponent>
  );
}
```

## Next Steps

- [Remember Pattern](/guides/remember/) - Cache-aside in React
- [Collections](/guides/collections/) - Type-safe domain caching
- [Error Handling](/guides/errors/) - Handle cache errors gracefully
- [Examples](/examples/) - More React examples
