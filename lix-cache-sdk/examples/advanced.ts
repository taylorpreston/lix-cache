import { LixCache } from '../src';

/**
 * Advanced usage patterns for Lix Cache SDK
 */

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface Product {
  id: string;
  title: string;
  price: number;
  inventory: number;
}

async function advancedExample() {
  const lix = new LixCache({
    url: process.env.LIX_CACHE_URL || 'http://localhost:4000',
    timeout: 10000, // 10 second timeout
  });

  console.log('=== Pattern 1: Separate Data and Metrics ===\n');

  // Store user data
  await lix.set('user:alice', {
    id: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    createdAt: new Date(),
  });

  // Store user metrics separately
  await lix.incr('user:alice:profile_views');
  await lix.incr('user:alice:posts_created', 5);
  await lix.incr('user:alice:likes_received', 42);

  console.log('✓ User data and metrics stored separately');

  // Retrieve all user-related data
  const userScan = await lix.scan('user:alice');
  console.log(`  Found ${userScan.count} items for user alice`);

  console.log('\n=== Pattern 2: Rate Limiting ===\n');

  async function checkRateLimit(userId: string): Promise<boolean> {
    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const key = `rate:${userId}:${hour}`;

    const count = await lix.incr(key);

    // Set TTL on first request (expires in 1 hour)
    if (count === 1) {
      await lix.set(key, count, { ttl: 3600 });
    }

    const limit = 100;
    if (count > limit) {
      console.log(`  ✗ Rate limit exceeded for ${userId}: ${count}/${limit}`);
      return false;
    }

    console.log(`  ✓ Request allowed for ${userId}: ${count}/${limit}`);
    return true;
  }

  await checkRateLimit('user123');
  await checkRateLimit('user123');
  await checkRateLimit('user123');

  console.log('\n=== Pattern 3: Inventory Management ===\n');

  async function purchaseProduct(productId: string, quantity: number): Promise<boolean> {
    // Get current inventory
    const product = await lix.get<Product>(`product:${productId}`);
    if (!product) {
      console.log(`  ✗ Product ${productId} not found`);
      return false;
    }

    // Check if enough inventory
    if (product.inventory < quantity) {
      console.log(`  ✗ Insufficient inventory: ${product.inventory} < ${quantity}`);
      return false;
    }

    // Decrement inventory
    const newInventory = await lix.decr(`product:${productId}:inventory`, quantity);
    console.log(`  ✓ Purchase successful. Inventory: ${newInventory}`);

    // Track sales
    await lix.incr(`product:${productId}:sales`, quantity);
    await lix.incr('sales:total', quantity);

    return true;
  }

  // Setup product
  await lix.set('product:laptop', {
    id: 'laptop',
    title: 'Laptop Pro',
    price: 999,
    inventory: 50,
  });
  await lix.set('product:laptop:inventory', 50);

  await purchaseProduct('laptop', 2);
  await purchaseProduct('laptop', 1);

  console.log('\n=== Pattern 4: Batch Operations ===\n');

  // Execute multiple operations in one request
  const results = await lix.batch([
    { op: 'get', key: 'user:alice' },
    { op: 'get', key: 'product:laptop' },
    { op: 'set', key: 'temp:batch', value: { test: true }, ttl: 10 },
  ]);

  console.log(`✓ Executed ${results.length} operations in batch`);
  results.forEach((result, i) => {
    if (result.op === 'get') {
      console.log(`  ${i + 1}. GET ${result.key}: ${result.value ? 'found' : 'not found'}`);
    } else if (result.op === 'set') {
      console.log(`  ${i + 1}. SET ${result.key}: ${result.success ? 'success' : 'failed'}`);
    }
  });

  console.log('\n=== Pattern 5: Cache-Aside Pattern ===\n');

  async function getUser(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;

    // Try cache first
    let user = await lix.get<User>(cacheKey);
    if (user) {
      console.log(`  ✓ Cache hit for ${userId}`);
      return user;
    }

    // Cache miss - fetch from "database"
    console.log(`  ⚠ Cache miss for ${userId}, fetching from DB...`);
    user = await fetchUserFromDatabase(userId);

    if (user) {
      // Store in cache for next time (TTL: 5 minutes)
      await lix.set(cacheKey, user, { ttl: 300 });
      console.log(`  ✓ Cached ${userId} for 5 minutes`);
    }

    return user;
  }

  async function fetchUserFromDatabase(userId: string): Promise<User | null> {
    // Simulate database lookup
    return {
      id: userId,
      name: 'Database User',
      email: `${userId}@example.com`,
      createdAt: new Date(),
    };
  }

  await getUser('user789'); // Cache miss
  await getUser('user789'); // Cache hit!

  console.log('\n=== Stats & Cleanup ===\n');

  const stats = await lix.stats();
  console.log(`✓ Total items in cache: ${stats.size}`);

  // Cleanup
  await lix.clear();
  console.log(`✓ Cache cleared`);
}

// Run the example
advancedExample().catch(console.error);
