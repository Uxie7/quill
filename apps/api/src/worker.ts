import { Worker, NativeConnection } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import * as activities from './activities/index';
import { cfg } from './config';

const connection = await NativeConnection.connect({ address: cfg.temporalAddress });
const worker = await Worker.create({
  connection,
  taskQueue: 'quill',
  workflowsPath: fileURLToPath(new URL('./workflows/processCall.ts', import.meta.url)), // TODO(verify): bundling TS workflows under tsx
  activities,
});
console.log('Quill worker running on task queue "quill"');
await worker.run();
