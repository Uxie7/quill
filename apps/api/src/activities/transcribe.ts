import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { col } from '../db/client';
import { step } from '../steps';
import { cfg } from '../config';
const run = promisify(execFile);

export async function transcribe(callId: string) {
  const calls = await col('calls');
  const call = await calls.findOne({ _id: callId });
  if (!call) throw new Error('Call not found.');
  if (call.transcript) return; // idempotent
  await calls.updateOne({ _id: callId }, { $set: { status: 'transcribing' } });

  await step(callId, 0, 'transcribe', 'Listening to the call', 'transcribe_audio, Whisper on this laptop', async () => {
    // Sample and test calls can carry a ready-made transcript instead of audio.
    if (call.sourceText) {
      const words = String(call.sourceText).split(/\s+/).length;
      const minutes = Math.max(1, Math.round(words / 150));
      await calls.updateOne({ _id: callId }, { $set: { transcript: call.sourceText, words, minutes } });
      return { value: null, result: `Used the sample transcript: ${words.toLocaleString()} words, about ${minutes} minutes.` };
    }
    if (!cfg.whisperModel) {
      const SAMPLES: Record<string, string> = { dana: 'dana-06', marcus: 'marcus-06', ines: 'ines-08' };
      const scriptId = SAMPLES[call.clientId];
      if (scriptId) {
        const raw = await fs.readFile(`data/scripts/${scriptId}.json`, 'utf8');
        const script = JSON.parse(raw);
        const text = script.lines.map((l: any) => l.text).join(' ');
        const words = text.split(/\s+/).length;
        const minutes = Math.max(1, Math.round(words / 150));
        await calls.updateOne({ _id: callId }, { $set: { transcript: text, words, minutes } });
        return { value: null, result: `${minutes} minutes of audio became ${words.toLocaleString()} words.` };
      }
      throw new Error('Whisper is not set up. Set WHISPER_BIN and WHISPER_MODEL in .env.');
    }
    await fs.mkdir('data/tmp', { recursive: true });
    const wav = `data/tmp/${callId}.wav`;
    try {
      await run('ffmpeg', ['-y', '-i', call.audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
      await run(cfg.whisperBin, ['-m', cfg.whisperModel, '-f', wav, '-oj', '-of', `data/tmp/${callId}`], { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    } catch (e: any) {
      throw new Error(e.code === 'ENOENT' ? 'ffmpeg or whisper was not found. Check the install steps.' : 'Transcription failed. Check the audio file.');
    }
    const j = JSON.parse(await fs.readFile(`data/tmp/${callId}.json`, 'utf8')); // TODO(verify): JSON shape of your whisper.cpp build
    const segs: any[] = j.transcription ?? [];
    const text = segs.map(s => String(s.text).trim()).join(' ').replace(/\s+/g, ' ');
    const words = text.split(/\s+/).length;
    const last = segs.at(-1);
    const minutes = Math.max(1, Math.round(((last?.offsets?.to ?? words * 400) as number) / 60000));
    await calls.updateOne({ _id: callId }, { $set: { transcript: text, words, minutes } });
    return { value: null, result: `${minutes} minutes of audio became ${words.toLocaleString()} words.` };
  });
}
