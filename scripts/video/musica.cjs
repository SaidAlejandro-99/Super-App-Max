// Música de fondo original (sin derechos de terceros): pad, arpegio, bajo y percusión suave.
const fs = require('fs');
const path = require('path');
const SR = 44100, BPM = 100, DUR = +(process.argv[2] || 160);
const N = Math.round(SR * DUR), L = new Float32Array(N), R = new Float32Array(N);
const beat = 60 / BPM, bar = beat * 4;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
// Am - F - C - G, dos compases por acorde.
const acordes = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]];
const acordeEn = t => acordes[Math.floor(t / (bar * 2)) % 4];
function add(i, l, r) { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } }
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// Pad: ondas casi cuadradas suavizadas, con detune y cambio lento.
for (let c = 0; c * bar * 2 < DUR; c++) {
  const t0 = c * bar * 2, notas = acordes[c % 4], len = bar * 2;
  notas.forEach((m, k) => [-0.06, 0.06].forEach((det, s) => {
    const f = hz(m + det); let lp = 0;
    for (let j = 0; j < len * SR; j++) {
      const t = j / SR, env = Math.min(1, t / 0.8) * Math.min(1, (len - t) / 0.6);
      const x = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) + 0.12 * Math.sin(2 * Math.PI * 3 * f * t);
      lp += 0.08 * (x - lp);
      const v = lp * env * 0.035;
      add(Math.round((t0 + t) * SR), s ? v * 0.6 : v, s ? v : v * 0.6);
    }
  }));
}
// Arpegio pluck en corcheas, desde el compás 4.
for (let k = 0; k * beat / 2 < DUR; k++) {
  const t0 = k * beat / 2; if (t0 < bar * 4) continue;
  const n = acordeEn(t0), m = n[[0, 1, 2, 3, 2, 1, 3, 2][k % 8]] + 12, f = hz(m);
  const pan = 0.5 + 0.35 * Math.sin(k * 0.7);
  for (let j = 0; j < 0.45 * SR; j++) {
    const t = j / SR, env = Math.exp(-t * 9);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 20)) * env * 0.06;
    for (const [d, g] of [[0, 1], [beat * 0.75, 0.35], [beat * 1.5, 0.15]]) add(Math.round((t0 + t + d) * SR), v * g * (1 - pan) * 2, v * g * pan * 2);
  }
}
// Bajo en negras, desde el compás 8.
for (let k = 0; k * beat < DUR; k++) {
  const t0 = k * beat; if (t0 < bar * 8) continue;
  const f = hz(acordeEn(t0)[0] - 12);
  for (let j = 0; j < beat * 0.9 * SR; j++) {
    const t = j / SR, env = Math.min(1, t / 0.01) * Math.exp(-t * 2.5);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * 2 * f * t)) * env * 0.11;
    add(Math.round((t0 + t) * SR), v, v);
  }
}
// Percusión suave desde el compás 8: bombo en 1 y 3, palmas en 2 y 4, hi-hat en contratiempos.
for (let k = 0; k * beat < DUR; k++) {
  const t0 = k * beat; if (t0 < bar * 8) continue;
  if (k % 2 === 0) for (let j = 0; j < 0.35 * SR; j++) {
    const t = j / SR, f = 50 + 90 * Math.exp(-t * 30), v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.22;
    add(Math.round((t0 + t) * SR), v, v);
  } else { let lp = 0; for (let j = 0; j < 0.2 * SR; j++) {
    const t = j / SR, x = rnd(); lp += 0.35 * (x - lp); const v = (x - lp) * Math.exp(-t * 18) * 0.07;
    add(Math.round((t0 + t) * SR), v, v);
  } }
  let hp = 0; for (let j = 0; j < 0.06 * SR; j++) {
    const t = j / SR, x = rnd(); hp += 0.5 * (x - hp); const v = (x - hp) * Math.exp(-t * 60) * 0.045;
    add(Math.round((t0 + beat / 2 + t) * SR), v * 0.7, v);
  }
}
// Fundido de entrada y salida, normalización y WAV de 16 bits.
let pk = 0; for (let i = 0; i < N; i++) {
  const t = i / SR, g = Math.min(1, t / 2) * Math.min(1, (DUR - t) / 4);
  L[i] *= g; R[i] *= g; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
}
const buf = Buffer.alloc(44 + N * 4), k = 0.89 / pk;
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
fs.writeFileSync(path.join(process.env.VIDEO_DIR || path.resolve(__dirname, '../../informes/video'), 'musica.wav'), buf);
console.log('musica.wav', DUR + 's');
