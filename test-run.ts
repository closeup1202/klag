import { collectLag } from './src/collector/lagCollector.js'
import { inspect } from 'util'

const snapshot = await collectLag({
  broker: 'localhost:9092',
  groupId: 'my-service',
})

console.log(inspect(snapshot, { depth: null, colors: true }))