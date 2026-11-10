// Video animado: capas que entran con movimiento, transiciones variadas y voz neuronal.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const WORK = process.env.VIDEO_DIR || path.resolve(__dirname, '../../informes/video');
const FF = require(path.join(WORK, 'tools/node_modules/ffmpeg-static'));
const SC = path.join(WORK, 'scenes');
const LY = path.join(WORK, 'layers');
const OUT = path.join(WORK, 'out');
const NOMBRE = process.argv[2] || 'Video';
fs.mkdirSync(OUT, { recursive: true });
const FPS = 30, LEAD = 0.8, TAIL = 0.7, X = 0.8, IN = 0.7;
const meta = JSON.parse(fs.readFileSync(path.join(SC, 'capas.json'), 'utf8'));
const TRANS = ['smoothleft', 'circleopen', 'slideup', 'wipeleft', 'smoothup', 'radial', 'slideleft', 'zoomin', 'circleclose', 'smoothleft', 'fadeblack'];
const MOV = { left: [-140, 0], right: [320, 0], up: [0, 110], fade: [0, 0] };

function duracion(f) {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(spawnSync(FF, ['-i', f], { encoding: 'utf8' }).stderr);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

const ids = Object.keys(meta).sort();
const escenas = [];
for (const id of ids) {
  const voz = path.join(SC, id + '.mp3');
  const dv = duracion(voz);
  const d = +(LEAD + dv + TAIL + X).toFixed(2);
  const capas = meta[id];
  const args = ['-y', '-framerate', String(FPS), '-loop', '1', '-t', String(d), '-i', path.join(LY, id + '-base.png')];
  capas.forEach((_, i) => args.push('-framerate', String(FPS), '-loop', '1', '-t', String(d), '-i', path.join(LY, `${id}-${i + 1}.png`)));
  const f = [`[0:v]crop=1920:1080:0:0,format=rgba[b0]`];
  capas.forEach((c, i) => {
    const T = c.t.startsWith('f') ? LEAD + parseFloat(c.t.slice(1)) * dv : parseFloat(c.t);
    const [dx, dy] = MOV[c.fx];
    const e = `(1-pow(1-clip((t-${T.toFixed(2)})/${IN},0,1),3))`;
    f.push(`[${i + 1}:v]crop=1920:1080:0:0,format=rgba,fade=t=in:st=${T.toFixed(2)}:d=${(IN * 0.8).toFixed(2)}:alpha=1[l${i + 1}]`);
    f.push(`[b${i}][l${i + 1}]overlay=x='${dx}*(1-${e})':y='${dy}*(1-${e})':eval=frame[b${i + 1}]`);
  });
  const fr = Math.round(d * FPS);
  f.push(`[b${capas.length}]scale=2880:1620,zoompan=z='1+0.035*on/${fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},format=yuv420p[v]`);
  const clip = path.join(OUT, id + '.mp4');
  execFileSync(FF, [...args, '-filter_complex', f.join(';'), '-map', '[v]', '-r', String(FPS), '-t', String(d),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', clip], { stdio: 'ignore' });
  escenas.push({ id, d, dv, voz, clip });
  console.log(id, d + 's', capas.length + ' capas');
}

// Unión con transiciones y voz en su sitio.
const args = ['-y'];
escenas.forEach(e => args.push('-i', e.clip));
escenas.forEach(e => args.push('-i', e.voz));
const f = [];
let prev = '[0:v]', off = 0;
const inicio = [0];
for (let i = 1; i < escenas.length; i++) {
  off += escenas[i - 1].d - X;
  inicio.push(off);
  const out = i === escenas.length - 1 ? '[vx]' : `[x${i}]`;
  f.push(`${prev}[${i}:v]xfade=transition=${TRANS[(i - 1) % TRANS.length]}:duration=${X}:offset=${off.toFixed(3)}${out}`);
  prev = out;
}
const total = inicio[inicio.length - 1] + escenas[escenas.length - 1].d;
f.push(`[vx]fade=t=out:st=${(total - 1).toFixed(2)}:d=1[v]`);
const n = escenas.length;
escenas.forEach((e, i) => {
  const ms = Math.round((inicio[i] + LEAD) * 1000);
  f.push(`[${n + i}:a]aresample=48000,adelay=${ms}|${ms},apad[a${i}]`);
});
f.push(`${escenas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest,pan=stereo|c0=c0|c1=c0,atrim=0:${total.toFixed(2)},asplit[vz][sc]`);

// Música de fondo del largo del video; baja sola cuando habla la voz.
execFileSync('node', [path.join(__dirname, 'musica.cjs'), String(Math.ceil(total) + 1)], { stdio: 'ignore' });
const mus = path.join(WORK, 'musica-rev.wav');
execFileSync(FF, ['-y', '-i', path.join(WORK, 'musica.wav'), '-af', 'aecho=0.8:0.6:120|210:0.25|0.15,loudnorm=I=-16:TP=-1.5', '-ar', '48000', mus], { stdio: 'ignore' });
args.push('-i', mus);
f.push(`[${2 * n}:a]volume=0.30[m]`, `[m][sc]sidechaincompress=threshold=0.03:ratio=5:attack=30:release=600[md]`,
  `[md]afade=t=out:st=${(total - 3).toFixed(2)}:d=3[mf]`, `[vz][mf]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`);
const final = path.join(OUT, NOMBRE + '.mp4');
execFileSync(FF, [...args, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final], { stdio: 'ignore' });
console.log('total', duracion(final).toFixed(1) + 's', (fs.statSync(final).size / 1e6).toFixed(1) + ' MB');

// Versión liviana para WhatsApp (720p, menos de 16 MB para que llegue como video).
const wa = path.join(OUT, NOMBRE + ' (WhatsApp).mp4');
execFileSync(FF, ['-y', '-i', final, '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
  '-preset', 'slow', '-b:v', '600k', '-maxrate', '900k', '-bufsize', '1800k', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', wa], { stdio: 'ignore' });
console.log('whatsapp', (fs.statSync(wa).size / 1e6).toFixed(1) + ' MB');
