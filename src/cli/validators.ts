import { InvalidArgumentError } from 'commander'

export function parseInterval(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError('--interval 은 1000ms 이상의 숫자여야 해요.')
  }
  return parsed
}

export function parseBroker(value: string): string {
  const pattern = /^.+:\d+$/
  if (!pattern.test(value)) {
    throw new InvalidArgumentError('--broker 형식이 올바르지 않아요. 예: localhost:9092')
  }
  return value
}

export function parseTimeout(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError('--timeout 은 1000ms 이상의 숫자여야 해요.')
  }
  return parsed
}