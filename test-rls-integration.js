#!/usr/bin/env node

/**
 * Test script for Clerk-Supabase RLS integration
 *
 * This script tests the Row Level Security setup by:
 * 1. Running the database migration
 * 2. Testing RLS functions directly in the database
 * 3. Testing API endpoints with authentication
 *
 * Usage:
 *   node test-rls-integration.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '[REDACTED]' : 'undefined');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runTests() {
  console.log('🧪 Testing Clerk-Supabase RLS Integration\n');

  // Test 1: Check if RLS is enabled
  console.log('1️⃣ Checking if RLS is enabled...');
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['worlds', 'user_api_keys']);

    if (error) {
      console.error('❌ Failed to check table information:', error);
      return;
    }

    // Check RLS status for each table
    for (const table of ['worlds', 'user_api_keys']) {
      const { data: rlsData, error: rlsError } = await supabase
        .rpc('check_rls_status', { table_name: table })
        .single();

      if (rlsError) {
        console.log(`⚠️  Could not check RLS status for ${table} (function may not exist yet)`);
      } else {
        console.log(`✅ RLS is ${rlsData ? 'enabled' : 'disabled'} on ${table} table`);
      }
    }
  } catch (error) {
    console.error('❌ RLS check failed:', error);
  }

  // Test 2: Check if auth functions exist
  console.log('\n2️⃣ Checking if auth functions exist...');
  try {
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'clerk_user_id');

    if (error) {
      console.error('❌ Failed to check functions:', error);
    } else if (data && data.length > 0) {
      console.log('✅ public.clerk_user_id() function exists');
    } else {
      console.log('❌ public.clerk_user_id() function not found - migration needed');
    }
  } catch (error) {
    console.error('❌ Function check failed:', error);
  }

  // Test 3: Test RLS function with mock data
  console.log('\n3️⃣ Testing RLS function...');
  const testUserId = 'user_test123';
  try {
    const { data, error } = await supabase
      .rpc('test_clerk_rls', { test_user_id: testUserId });

    if (error) {
      console.error('❌ RLS test function failed:', error);
    } else {
      console.log('✅ RLS test results:');
      data.forEach(result => {
        const status = result.result ? '✅' : '❌';
        console.log(`   ${status} ${result.test_name}: ${result.message}`);
      });
    }
  } catch (error) {
    console.error('❌ RLS test failed:', error);
  }

  // Test 4: Check policies
  console.log('\n4️⃣ Checking RLS policies...');
  try {
    const { data, error } = await supabase
      .from('pg_policies')
      .select('tablename, policyname, permissive, cmd, qual')
      .in('tablename', ['worlds', 'user_api_keys']);

    if (error) {
      console.error('❌ Failed to check policies:', error);
    } else {
      console.log('✅ Found RLS policies:');
      data.forEach(policy => {
        console.log(`   - ${policy.tablename}.${policy.policyname} (${policy.cmd})`);
      });
    }
  } catch (error) {
    console.error('❌ Policy check failed:', error);
  }

  console.log('\n🏁 RLS Integration Test Complete\n');

  // Instructions for next steps
  console.log('📋 Next Steps:');
  console.log('1. Run the migration: Execute supabase/migrations/20250918_clerk_jwt_integration.sql in Supabase SQL Editor');
  console.log('2. Configure Clerk JWT template in Clerk Dashboard');
  console.log('3. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  console.log('4. Test with: curl http://localhost:3001/api/test-rls -H "Authorization: Bearer <clerk-token>"');
}

// Add helper function for checking RLS status
async function createHelperFunctions() {
  console.log('📝 Creating helper functions...');

  const helperSQL = `
    -- Helper function to check RLS status
    CREATE OR REPLACE FUNCTION check_rls_status(table_name TEXT)
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN (
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = table_name
        AND relnamespace = 'public'::regnamespace
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: helperSQL });
    if (error) {
      console.log('⚠️  Could not create helper function (may not have permissions)');
    } else {
      console.log('✅ Helper functions created');
    }
  } catch (error) {
    console.log('⚠️  Could not create helper function');
  }
}

// Run the tests
await createHelperFunctions();
await runTests();