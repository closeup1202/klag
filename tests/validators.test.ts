import { describe, it, expect } from 'vitest'
import { parseInterval, parseBroker, parseTimeout } from '../src/cli/validators.js'

describe('parseInterval', () => {
  it('유효한 숫자면 그대로 반환', () => {
    expect(parseInterval('5000')).toBe(5000)
    expect(parseInterval('1000')).toBe(1000)
    expect(parseInterval('10000')).toBe(10000)
  })

  it('숫자가 아니면 에러', () => {
    expect(() => parseInterval('abc')).toThrow('1000ms 이상의 숫자')
    expect(() => parseInterval('')).toThrow('1000ms 이상의 숫자')
    expect(() => parseInterval('1.5')).toThrow('1000ms 이상의 숫자')
  })

  it('1000ms 미만이면 에러', () => {
    expect(() => parseInterval('999')).toThrow('1000ms 이상의 숫자')
    expect(() => parseInterval('500')).toThrow('1000ms 이상의 숫자')
    expect(() => parseInterval('0')).toThrow('1000ms 이상의 숫자')
  })
})

describe('parseBroker', () => {
  it('올바른 host:port 형식이면 그대로 반환', () => {
    expect(parseBroker('localhost:9092')).toBe('localhost:9092')
    expect(parseBroker('kafka.example.com:9092')).toBe('kafka.example.com:9092')
    expect(parseBroker('192.168.0.1:9092')).toBe('192.168.0.1:9092')
  })

  it('port 없으면 에러', () => {
    expect(() => parseBroker('localhost')).toThrow('형식이 올바르지 않아요')
    expect(() => parseBroker('kafka.example.com')).toThrow('형식이 올바르지 않아요')
  })

  it('빈 문자열이면 에러', () => {
    expect(() => parseBroker('')).toThrow('형식이 올바르지 않아요')
  })

  it('포트가 숫자가 아니면 에러', () => {
    expect(() => parseBroker('localhost:abc')).toThrow('형식이 올바르지 않아요')
  })
})

describe('parseTimeout', () => {
  it('유효한 숫자면 그대로 반환', () => {
    expect(parseTimeout('3000')).toBe(3000)
    expect(parseTimeout('1000')).toBe(1000)
  })

  it('숫자가 아니면 에러', () => {
    expect(() => parseTimeout('abc')).toThrow('1000ms 이상의 숫자')
    expect(() => parseTimeout('')).toThrow('1000ms 이상의 숫자')
  })

  it('1000ms 미만이면 에러', () => {
    expect(() => parseTimeout('999')).toThrow('1000ms 이상의 숫자')
    expect(() => parseTimeout('0')).toThrow('1000ms 이상의 숫자')
  })
})