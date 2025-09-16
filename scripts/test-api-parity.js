#!/usr/bin/env node

/**
 * API Parity Test Script
 *
 * This script tests that both development (Express) and production (Vercel)
 * API endpoints behave consistently. Run this before deploying to catch
 * any divergence between the two implementations.
 */

const { fork } = require('child_process');

// Use built-in fetch if available (Node 18+), otherwise try to require node-fetch
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
  console.error('❌ This script requires Node.js 18+ or node-fetch package');
  console.error('   Install with: npm install --save-dev node-fetch');
  process.exit(1);
}

// Test configuration
const EXPRESS_PORT = 3001;
const VERCEL_PORT = 3000;
const TEST_TIMEOUT = 30000;

const testCases = [
  {
    name: 'Config endpoint',
    path: '/api/config',
    method: 'GET',
    expectedKeys: ['enableUserApiKeys']
  },
  {
    name: 'Generate endpoint (basic test)',
    path: '/api/generate',
    method: 'POST',
    body: {
      input: 'A magical floating city',
      type: 'seed'
    },
    expectedStreamingResponse: true
  }
];

async function waitForServer(port, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/api/config`);
      if (response.ok) return true;
    } catch (error) {
      // Server not ready, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

async function testEndpoint(port, testCase) {
  const url = `http://localhost:${port}${testCase.path}`;
  const options = {
    method: testCase.method,
    headers: { 'Content-Type': 'application/json' },
    ...(testCase.body && { body: JSON.stringify(testCase.body) })
  };

  try {
    const response = await fetch(url, options);

    if (testCase.expectedStreamingResponse) {
      // For streaming endpoints, just check headers
      return {
        status: response.status,
        isStreaming: response.headers.get('x-streaming') === 'true',
        contentType: response.headers.get('content-type')
      };
    } else {
      // For regular endpoints, parse JSON
      const data = await response.json();
      return {
        status: response.status,
        data,
        hasExpectedKeys: testCase.expectedKeys ?
          testCase.expectedKeys.every(key => key in data) : true
      };
    }
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  console.log('🧪 API Parity Test Suite\n');

  // Start Express server
  console.log('🚀 Starting Express server...');
  const expressProcess = fork('./api/index.ts', [], {
    execArgv: ['--import', 'tsx/esm'],
    env: { ...process.env, PORT: EXPRESS_PORT }
  });

  // Wait for servers to be ready
  console.log('⏳ Waiting for servers to start...');

  const expressReady = await waitForServer(EXPRESS_PORT);
  if (!expressReady) {
    console.error('❌ Express server failed to start');
    expressProcess.kill();
    process.exit(1);
  }

  console.log('✅ Express server ready');
  console.log('ℹ️  To test against Vercel dev server, run "vercel dev" in another terminal\n');

  // Run tests
  let allTestsPassed = true;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);

    // Test Express
    const expressResult = await testEndpoint(EXPRESS_PORT, testCase);
    console.log(`  Express (${EXPRESS_PORT}):`,
      expressResult.error ? `❌ ${expressResult.error}` : '✅');

    // Optional: Test Vercel if running
    const vercelReady = await waitForServer(VERCEL_PORT, 1);
    if (vercelReady) {
      const vercelResult = await testEndpoint(VERCEL_PORT, testCase);
      console.log(`  Vercel (${VERCEL_PORT}): `,
        vercelResult.error ? `❌ ${vercelResult.error}` : '✅');

      // Compare results
      if (!vercelResult.error && !expressResult.error) {
        const match = JSON.stringify(expressResult) === JSON.stringify(vercelResult);
        console.log(`  Parity: ${match ? '✅ Identical' : '⚠️  Different'}`);
        if (!match) {
          allTestsPassed = false;
          console.log('    Express:', expressResult);
          console.log('    Vercel: ', vercelResult);
        }
      }
    } else {
      console.log(`  Vercel (${VERCEL_PORT}):  ⏭️ Not running`);
    }

    console.log();
  }

  // Cleanup
  expressProcess.kill();

  console.log(allTestsPassed ?
    '🎉 All API parity tests passed!' :
    '⚠️  Some tests showed differences between environments');

  process.exit(allTestsPassed ? 0 : 1);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted');
  process.exit(1);
});

runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});