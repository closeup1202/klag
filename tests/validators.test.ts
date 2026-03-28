import { existsSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseBroker, parseCertPath, parseInterval, parseSaslMechanism, parseTimeout } from '../src/cli/validators.js'

vi.mock('node:fs', () => ({ existsSync: vi.fn() }))

describe('parseInterval', () => {
  it('returns value as-is for valid number', () => {
    expect(parseInterval('5000')).toBe(5000)
    expect(parseInterval('1000')).toBe(1000)
    expect(parseInterval('10000')).toBe(10000)
  })

  it('throws error for non-numeric input', () => {
    expect(() => parseInterval('abc')).toThrow('>= 1000ms')
    expect(() => parseInterval('')).toThrow('>= 1000ms')
    expect(() => parseInterval('1.5')).toThrow('>= 1000ms')
  })

  it('throws error if below 1000ms', () => {
    expect(() => parseInterval('999')).toThrow('>= 1000ms')
    expect(() => parseInterval('500')).toThrow('>= 1000ms')
    expect(() => parseInterval('0')).toThrow('>= 1000ms')
  })
})

describe('parseBroker', () => {
  it('returns value as-is for valid host:port format', () => {
    expect(parseBroker('localhost:9092')).toBe('localhost:9092')
    expect(parseBroker('kafka.example.com:9092')).toBe('kafka.example.com:9092')
    expect(parseBroker('192.168.0.1:9092')).toBe('192.168.0.1:9092')
  })

  it('throws error if port is missing', () => {
    expect(() => parseBroker('localhost')).toThrow('format is invalid')
    expect(() => parseBroker('kafka.example.com')).toThrow('format is invalid')
  })

  it('throws error for empty string', () => {
    expect(() => parseBroker('')).toThrow('format is invalid')
  })

  it('throws error if port is not numeric', () => {
    expect(() => parseBroker('localhost:abc')).toThrow('format is invalid')
  })

  it('throws error if port is out of range', () => {
    expect(() => parseBroker('localhost:0')).toThrow('1 and 65535')
    expect(() => parseBroker('localhost:65536')).toThrow('1 and 65535')
    expect(() => parseBroker('localhost:99999')).toThrow('1 and 65535')
  })

  it('accepts boundary port values', () => {
    expect(parseBroker('localhost:1')).toBe('localhost:1')
    expect(parseBroker('localhost:65535')).toBe('localhost:65535')
  })
})

describe('parseTimeout', () => {
  it('returns value as-is for valid number', () => {
    expect(parseTimeout('3000')).toBe(3000)
    expect(parseTimeout('1000')).toBe(1000)
  })

  it('throws error for non-numeric input', () => {
    expect(() => parseTimeout('abc')).toThrow('>= 1000ms')
    expect(() => parseTimeout('')).toThrow('>= 1000ms')
  })

  it('throws error if below 1000ms', () => {
    expect(() => parseTimeout('999')).toThrow('>= 1000ms')
    expect(() => parseTimeout('0')).toThrow('>= 1000ms')
  })
})

describe('parseSaslMechanism', () => {
  it('accepts valid mechanisms', () => {
    expect(parseSaslMechanism('plain')).toBe('plain')
    expect(parseSaslMechanism('scram-sha-256')).toBe('scram-sha-256')
    expect(parseSaslMechanism('scram-sha-512')).toBe('scram-sha-512')
  })

  it('throws for unsupported mechanisms', () => {
    expect(() => parseSaslMechanism('aws')).toThrow('must be one of')
    expect(() => parseSaslMechanism('oauthbearer')).toThrow('must be one of')
    expect(() => parseSaslMechanism('PLAIN')).toThrow('must be one of')
    expect(() => parseSaslMechanism('')).toThrow('must be one of')
  })
})

describe('parseCertPath', () => {
  it('returns path when file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(parseCertPath('/etc/kafka/ca.pem')).toBe('/etc/kafka/ca.pem')
  })

  it('throws when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(() => parseCertPath('/nonexistent/ca.pem')).toThrow('not found')
  })
})
