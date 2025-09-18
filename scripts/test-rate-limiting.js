#!/usr/bin/env node

/**
 * Test script for rate limiting functionality
 *
 * Usage:
 *   npm run dev:api  # Start the Express server
 *   node scripts/test-rate-limiting.js
 */

const BASE_URL = 'http://localhost:3001';

// Mock auth token for testing (you'll need a valid Clerk token)
const MOCK_AUTH_TOKEN = 'your_clerk_test_token_here';

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${MOCK_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  return {
    status: response.status,
    headers: {
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
      'retry-after': response.headers.get('retry-after')
    },
    data: await response.json().catch(() => null)
  };
}

async function testRateLimit(endpoint, description, maxRequests = 5) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log(`📊 Expected limit: ${maxRequests} requests/minute`);
  console.log('─'.repeat(60));

  for (let i = 1; i <= maxRequests + 2; i++) {
    try {
      const result = await makeRequest(endpoint);

      const status = result.status === 429 ? '🚫' : '✅';
      const remaining = result.headers['x-ratelimit-remaining'] || 'N/A';
      const retryAfter = result.headers['retry-after'] || 'N/A';

      console.log(`${status} Request ${i}: Status ${result.status} | Remaining: ${remaining} | Retry-After: ${retryAfter}s`);

      if (result.status === 429) {
        console.log(`   Rate limit hit! Message: ${result.data?.message || 'No message'}`);
        break;
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`❌ Request ${i}: Error - ${error.message}`);
    }
  }
}

async function testDifferentEndpoints() {
  console.log('🚀 Starting Rate Limiting Tests');
  console.log('═'.repeat(60));

  // Test different endpoint types with their respective limits
  const tests = [
    { endpoint: '/api/config', description: 'Config endpoint (Global: 200/min)', max: 200 },
    { endpoint: '/api/usage', description: 'Usage endpoint (Global: 200/min)', max: 200 },
    // Note: These would need authentication and proper request bodies in real testing
    // { endpoint: '/api/store-key', description: 'API Key operations (20/min)', max: 20 },
    // { endpoint: '/api/worlds', description: 'World operations (100/min)', max: 100 },
  ];

  for (const test of tests) {
    await testRateLimit(test.endpoint, test.description, test.max);

    // Wait a bit between different endpoint tests
    console.log('\n⏳ Waiting 2 seconds before next test...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function testInMemoryFallback() {
  console.log('\n🧪 Testing In-Memory Fallback');
  console.log('─'.repeat(60));

  // This will work if Redis is not configured
  const result = await makeRequest('/api/config');

  if (result.headers['x-ratelimit-limit']) {
    console.log('✅ Rate limiting headers present');
    console.log(`   Limit: ${result.headers['x-ratelimit-limit']}`);
    console.log(`   Remaining: ${result.headers['x-ratelimit-remaining']}`);
    console.log(`   Reset: ${result.headers['x-ratelimit-reset']}`);
  } else {
    console.log('❌ No rate limiting headers found');
  }
}

async function main() {
  console.log('Rate Limiting Test Suite');
  console.log('═'.repeat(60));
  console.log('⚠️  Make sure the Express server is running: npm run dev:api');
  console.log('⚠️  Update MOCK_AUTH_TOKEN with a valid Clerk token for full testing');
  console.log('');

  try {
    // Test basic functionality
    await testInMemoryFallback();

    // Test different endpoints (limited without auth)
    // await testDifferentEndpoints();

    console.log('\n✅ Rate limiting tests completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set up Redis or Vercel KV for production');
    console.log('   2. Test with valid authentication tokens');
    console.log('   3. Monitor rate limiting in production logs');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { makeRequest, testRateLimit };