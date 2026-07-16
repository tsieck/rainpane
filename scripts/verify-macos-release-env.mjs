#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const present = (name) => Boolean(process.env[name]?.trim())

if (process.platform !== 'darwin') {
  console.error('Rainpane macOS release preflight must run on macOS.')
  process.exit(1)
}

const identityCheck = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
  encoding: 'utf8',
})
const identityOutput = `${identityCheck.stdout ?? ''}\n${identityCheck.stderr ?? ''}`
const hasDeveloperIdIdentity = /Developer ID Application:/u.test(identityOutput) || present('CSC_LINK')

const hasAppleIdCredentials =
  present('APPLE_ID') && present('APPLE_APP_SPECIFIC_PASSWORD') && present('APPLE_TEAM_ID')
const hasApiKeyCredentials =
  present('APPLE_API_KEY') && present('APPLE_API_KEY_ID') && present('APPLE_API_ISSUER')
const hasKeychainProfile = present('APPLE_KEYCHAIN_PROFILE')
const hasNotarizationCredentials = hasAppleIdCredentials || hasApiKeyCredentials || hasKeychainProfile

const missing = []
if (!hasDeveloperIdIdentity) {
  missing.push('a Developer ID Application identity (keychain or CSC_LINK)')
}
if (!hasNotarizationCredentials) {
  missing.push('Apple ID, App Store Connect API key, or notarytool keychain-profile credentials')
}

if (missing.length > 0) {
  console.error('Rainpane cannot create a signed and notarized macOS release:')
  for (const item of missing) {
    console.error(`- Missing ${item}`)
  }
  console.error('Use npm run dist:mac:unsigned for a local, non-distributable validation build.')
  process.exit(1)
}

console.log('macOS release signing and notarization inputs are present.')
