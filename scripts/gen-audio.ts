// npm run gen:audio : voices the scripts in data/scripts with ElevenLabs and joins them with ffmpeg.
// Needs ELEVENLABS_API_KEY, EL_VOICE_YOU, EL_VOICE_CLIENT and ffmpeg. Uses roughly 5,000 characters in total.
import 'dotenv/config';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const VOICE: Record<string, string | undefined> = { you: process.env.EL_VOICE_YOU, client: process.env.EL_VOICE_CLIENT };
if (!process.env.ELEVENLABS_API_KEY || !VOICE.you || !VOICE.client) { console.error('Set ELEVENLABS_API_KEY, EL_VOICE_YOU and EL_VOICE_CLIENT in .env'); process.exit(1); }
fs.mkdirSync('data/tmp', { recursive: true });
fs.mkdirSync('data/audio', { recursive: true });

for (const f of fs.readdirSync('data/scripts').filter(x => x.endsWith('.json'))) {
  const script = JSON.parse(fs.readFileSync(`data/scripts/${f}`, 'utf8'));
  if (fs.existsSync(`data/audio/${script.id}.mp3`)) { console.log(`skip ${script.id} (exists)`); continue; }
  const parts: string[] = [];
  for (const [i, l] of script.lines.entries()) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[l.speaker]}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: l.text, model_id: 'eleven_multilingual_v2' }), // TODO(verify): model ids and limits
    });
    if (!r.ok) { console.error(`ElevenLabs error ${r.status} on ${script.id} line ${i}`); process.exit(1); }
    const file = `data/tmp/${script.id}-${i}.mp3`;
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    parts.push(file);
  }
  fs.writeFileSync(`data/tmp/${script.id}.txt`, parts.map(p => `file '${p.replace('data/tmp/', '')}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `data/tmp/${script.id}.txt`, '-c', 'copy', `data/audio/${script.id}.mp3`]);
  console.log(`wrote data/audio/${script.id}.mp3`);
}
