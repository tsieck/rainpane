#!/usr/bin/env node

import { chmodSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin') {
  console.log('Skipping Rainpane refraction helper: ScreenCaptureKit is macOS-only.')
  process.exit(0)
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const nativeDirectory = join(projectRoot, 'native')
const outputDirectory = join(projectRoot, 'build', 'native')
const moduleCacheDirectory = join(projectRoot, 'build', '.swift-module-cache')
const outputPath = join(outputDirectory, 'rainpane-refraction-helper')
const swiftSources = readdirSync(nativeDirectory)
  .filter((name) => name.endsWith('.swift'))
  .sort()
  .map((name) => join(nativeDirectory, name))

if (swiftSources.length === 0) {
  throw new Error(`No Swift sources found in ${nativeDirectory}`)
}

mkdirSync(outputDirectory, { recursive: true })
mkdirSync(moduleCacheDirectory, { recursive: true })

const requestedArchitecture = process.env.npm_config_arch ?? process.env.ARCH ?? process.arch
const architecture = requestedArchitecture === 'x64' || requestedArchitecture === 'x86_64'
  ? 'x86_64'
  : 'arm64'
const target = `${architecture}-apple-macosx13.0`
const frameworks = [
  'AppKit',
  'CoreGraphics',
  'CoreMedia',
  'CoreVideo',
  'Foundation',
  'Metal',
  'QuartzCore',
  'ScreenCaptureKit',
]

const argumentsForSwiftC = [
  'swiftc',
  '-O',
  '-whole-module-optimization',
  '-target',
  target,
  ...swiftSources,
  '-o',
  outputPath,
  ...frameworks.flatMap((framework) => ['-framework', framework]),
]

const result = spawnSync('xcrun', argumentsForSwiftC, {
  cwd: projectRoot,
  env: {
    ...process.env,
    CLANG_MODULE_CACHE_PATH: moduleCacheDirectory,
    MACOSX_DEPLOYMENT_TARGET: '13.0',
    SWIFT_MODULE_CACHE_PATH: moduleCacheDirectory,
  },
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

chmodSync(outputPath, 0o755)
console.log(`Built ${outputPath}`)
