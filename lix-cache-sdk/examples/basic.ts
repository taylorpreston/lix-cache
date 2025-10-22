import { LixCache } from '../src';

/**
 * Basic usage examples for Lix Cache SDK
 */

// Define a user type for type safety
interface User {
  name: string;
  email: string;
  age: number;
}

async function basicExample() {
  // Create a client (defaults to http://localhost:4000)
  const lix = new LixCache();

  console.log('=== Basic Operations ===\n');

  // Set a value
  await lix.set('user:1', {
    name: 'Alice',
    email: 'alice@example.com',
    age: 30,
  });
  console.log('✓ Set user:1');

  // Get a value - fully typed!
  const user = await lix.get<User>('user:1');
  if (user) {
    console.log(`✓ Got user: ${user.name}, ${user.email}`);
  }

  // Set with TTL (expires in 60 seconds)
  await lix.set('session:abc', { token: 'xyz123' }, { ttl: 60 });
  console.log('✓ Set session with 60s TTL');

  // Delete a value
  await lix.delete('session:abc');
  console.log('✓ Deleted session');

  console.log('\n=== Counters ===\n');

  // Increment a counter
  const views = await lix.incr('page:home:views');
  console.log(`✓ Page views: ${views}`);

  // Increment by custom amount
  const score = await lix.incr('user:1:score', 10);
  console.log(`✓ User score: ${score}`);

  // Decrement
  const inventory = await lix.set('product:laptop:inventory', 100);
  const remaining = await lix.decr('product:laptop:inventory', 1);
  console.log(`✓ Inventory remaining: ${remaining}`);

  console.log('\n=== Scanning ===\n');

  // Store multiple users
  await lix.set('user:2', { name: 'Bob', email: 'bob@example.com', age: 25 });
  await lix.set('user:3', { name: 'Charlie', email: 'charlie@example.com', age: 35 });

  // Scan for all users
  const result = await lix.scan<User>('user:');
  console.log(`✓ Found ${result.count} users:`);
  result.items?.forEach((item) => {
    console.log(`  - ${item.key}: ${item.value.name}`);
  });

  console.log('\n=== Stats ===\n');

  // Get cache statistics
  const stats = await lix.stats();
  console.log(`✓ Cache has ${stats.size} items (limit: ${stats.limit})`);

  console.log('\n=== Cleanup ===\n');

  // Clear everything
  const cleared = await lix.clear();
  console.log(`✓ Cleared ${cleared.cleared} items`);
}

// Run the example
basicExample().catch(console.error);
