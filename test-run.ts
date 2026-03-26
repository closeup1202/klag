import { collectLag } from './src/collector/lagCollector.js'
import { printLagTable } from './src/reporter/tableReporter.js'

const snapshot = await collectLag({
  broker: 'localhost:9092',
  groupId: 'my-service',
})

printLagTable(snapshot)