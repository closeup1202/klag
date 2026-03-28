import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

// Mock node:fs and node:os before importing the module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
}))

import { existsSync, readFileSync } from 'node:fs'
import { loadConfig } from '../src/cli/configLoader.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = readFileSync as unknown as Mock

function mockFile(path: string, content: unknown) {
  mockExistsSync.mockImplementation((p) => p === path)
  mockReadFileSync.mockReturnValue(JSON.stringify(content))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadConfig', () => {
  it('returns null when no .klagrc file exists', () => {
    mockExistsSync.mockReturnValue(false)
    expect(loadConfig()).toBeNull()
  })

  it('loads .klagrc from current directory when it exists', () => {
    const cwd = process.cwd()
    mockFile(`${cwd}/.klagrc`, { broker: 'kafka:9092', group: 'my-group' })

    const result = loadConfig()

    expect(result).not.toBeNull()
    expect(result?.config.broker).toBe('kafka:9092')
    expect(result?.config.group).toBe('my-group')
    expect(result?.loadedFrom).toBe(`${cwd}/.klagrc`)
  })

  it('falls back to home directory .klagrc when cwd one is absent', () => {
    mockFile('/home/user/.klagrc', { broker: 'home-kafka:9092' })

    const result = loadConfig()

    expect(result?.config.broker).toBe('home-kafka:9092')
    expect(result?.loadedFrom).toBe('/home/user/.klagrc')
  })

  it('throws a friendly error for invalid JSON', () => {
    const cwd = process.cwd()
    mockExistsSync.mockImplementation((p) => p === `${cwd}/.klagrc`)
    mockReadFileSync.mockReturnValue('not-json')

    expect(() => loadConfig()).toThrow('Failed to parse')
  })

  it('throws when root value is not an object', () => {
    const cwd = process.cwd()
    mockExistsSync.mockImplementation((p) => p === `${cwd}/.klagrc`)
    mockReadFileSync.mockReturnValue(JSON.stringify([1, 2, 3]))

    expect(() => loadConfig()).toThrow('must be a JSON object')
  })

  it('throws when interval is not a number', () => {
    const cwd = process.cwd()
    mockFile(`${cwd}/.klagrc`, { interval: 'five-seconds' })

    expect(() => loadConfig()).toThrow('"interval" must be a number')
  })

  it('throws when broker is not a string', () => {
    const cwd = process.cwd()
    mockFile(`${cwd}/.klagrc`, { broker: 9092 })

    expect(() => loadConfig()).toThrow('"broker" must be a string')
  })

  it('warns but does not throw on unknown keys', () => {
    const cwd = process.cwd()
    mockFile(`${cwd}/.klagrc`, { broker: 'kafka:9092', unknownKey: true })

    expect(() => loadConfig()).not.toThrow()
  })

  it('warns but does not throw when sasl.password is present', () => {
    const cwd = process.cwd()
    mockFile(`${cwd}/.klagrc`, {
      sasl: { mechanism: 'plain', username: 'user', password: 'secret' },
    })

    expect(() => loadConfig()).not.toThrow()
  })
})
