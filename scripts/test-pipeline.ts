import { runPipeline } from '../apps/api/src/pipeline';

async function main() {
  try {
    console.log('Testing pipeline...');
    const result = await runPipeline('6ad3d49a58a10e20f541be12');
    console.log('PIPELINE RESULT:', result);
  } catch (e: any) {
    console.error('PIPELINE ERROR:', e.message, e.stack);
  }
  process.exit(0);
}

main();
