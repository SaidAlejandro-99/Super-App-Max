// Narración de cada escena con voz neuronal de Microsoft (la de Edge). Por defecto Jorge (es-MX), la que escogió Said.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const WORK = process.env.VIDEO_DIR || path.resolve(import.meta.dirname, '../../informes/video');
const { MsEdgeTTS, OUTPUT_FORMAT } = createRequire(path.join(WORK, 'tools/'))('msedge-tts');
const SC = path.join(WORK, 'scenes'), VOZ = process.argv[2] || 'es-MX-JorgeNeural';
for (const f of fs.readdirSync(SC).filter(f => f.endsWith('.txt')).sort()) {
  const id = f.slice(0, -4);
  if (fs.existsSync(path.join(SC, id + '.mp3'))) continue;
  const dir = path.join(SC, 'v-' + id); fs.mkdirSync(dir, { recursive: true });
  for (let k = 0; k < 8; k++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioFilePath } = await tts.toFile(dir, fs.readFileSync(path.join(SC, f), 'utf8'), { rate: '+6%', pitch: '+2%' });
      fs.copyFileSync(audioFilePath, path.join(SC, id + '.mp3')); tts.close(); console.log('ok', id); break;
    } catch (e) { await new Promise(r => setTimeout(r, 30000)); }
  }
  await new Promise(r => setTimeout(r, 8000));
}
