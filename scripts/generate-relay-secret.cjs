#!/usr/bin/env node
/**
 * scripts/generate-relay-secret.cjs
 * Cryptographically secure random secret generator for DANDY Google Apps Script Mail Relay.
 *
 * Usage:
 *   node scripts/generate-relay-secret.cjs
 */

const crypto = require('crypto');

function generateSecret() {
  const secret = crypto.randomBytes(32).toString('hex'); // 64 hex characters (256 bits)
  console.log('================================================================');
  console.log('🔑 DANDY Mail Relay — Cryptographically Secure Shared Secret');
  console.log('================================================================');
  console.log('\nSecret:');
  console.log(secret);
  console.log('\n----------------------------------------------------------------');
  console.log('📋 Next Steps:');
  console.log('1. Set in Vercel Environment Variables:');
  console.log('   GMAIL_RELAY_SECRET=' + secret);
  console.log('\n2. Set in Google Apps Script (Project Settings -> Script Properties):');
  console.log('   Property: DANDY_RELAY_SECRET');
  console.log('   Value:    ' + secret);
  console.log('\n⚠️  NEVER commit this secret to Git or share it publicly.');
  console.log('================================================================');
}

generateSecret();
