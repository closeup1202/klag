import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthOptions } from '../src/cli/authBuilder.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildAuthOptions — SSL', () => {
  it('returns empty object when no SSL or SASL options are given', () => {
    expect(buildAuthOptions({})).toEqual({})
  })

  it('sets ssl.enabled when --ssl flag is passed', () => {
    const result = buildAuthOptions({ ssl: true })
    expect(result.ssl?.enabled).toBe(true)
  })

  it('includes caPath when --ssl-ca is given', () => {
    const result = buildAuthOptions({ ssl: true, sslCa: '/etc/kafka/ca.pem' })
    expect(result.ssl?.caPath).toBe('/etc/kafka/ca.pem')
  })

  it('enables ssl implicitly when any ssl cert option is present', () => {
    const result = buildAuthOptions({ sslCa: '/path/ca.pem' })
    expect(result.ssl?.enabled).toBe(true)
  })
})

describe('buildAuthOptions — SASL', () => {
  it('uses KLAG_SASL_PASSWORD env var when set', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', 'env-secret')

    const result = buildAuthOptions({
      saslMechanism: 'plain',
      saslUsername: 'user',
    })

    expect(result.sasl?.password).toBe('env-secret')
  })

  it('env var takes precedence over --sasl-password CLI arg', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', 'env-secret')

    const result = buildAuthOptions({
      saslMechanism: 'plain',
      saslUsername: 'user',
      saslPassword: 'cli-secret',
    })

    expect(result.sasl?.password).toBe('env-secret')
  })

  it('falls back to CLI --sasl-password when env var is not set', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', '')

    const result = buildAuthOptions({
      saslMechanism: 'scram-sha-256',
      saslUsername: 'user',
      saslPassword: 'cli-secret',
    })

    expect(result.sasl?.password).toBe('cli-secret')
  })

  it('throws when neither env var nor CLI password is provided', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', '')

    expect(() =>
      buildAuthOptions({ saslMechanism: 'plain', saslUsername: 'user' })
    ).toThrow('SASL password is required')
  })

  it('throws when --sasl-mechanism is set but --sasl-username is missing', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', 'secret')

    expect(() =>
      buildAuthOptions({ saslMechanism: 'plain' })
    ).toThrow('--sasl-username is required')
  })

  it('builds correct sasl object for scram-sha-512', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', 'secret')

    const result = buildAuthOptions({
      saslMechanism: 'scram-sha-512',
      saslUsername: 'kafka-user',
    })

    expect(result.sasl?.mechanism).toBe('scram-sha-512')
    expect(result.sasl?.username).toBe('kafka-user')
    expect(result.sasl?.password).toBe('secret')
  })

  it('does not set sasl when no mechanism is given', () => {
    const result = buildAuthOptions({ saslUsername: 'user' })
    expect(result.sasl).toBeUndefined()
  })
})

describe('buildAuthOptions — validators', () => {
  it('adds ssl and sasl simultaneously', () => {
    vi.stubEnv('KLAG_SASL_PASSWORD', 'secret')

    const result = buildAuthOptions({
      ssl: true,
      sslCa: '/etc/ca.pem',
      saslMechanism: 'scram-sha-256',
      saslUsername: 'user',
    })

    expect(result.ssl).toBeDefined()
    expect(result.sasl).toBeDefined()
  })
})
