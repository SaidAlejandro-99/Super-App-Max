// Escenas del video para gerencia: cada una es un HTML 1920x1080 + el texto de la voz.
// Las imágenes van en informes/video/img; los data-a="efecto:segundo" marcan las capas que entran animadas.
const fs = require('fs');
const path = require('path');
const WORK = process.env.VIDEO_DIR || path.resolve(__dirname, '../../informes/video');
const OUT = path.join(WORK, 'scenes');
fs.mkdirSync(OUT, { recursive: true });

const BASE = `*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;background:#0f1a14;color:#e8efe8;font-family:'Segoe UI',Arial,sans-serif;position:relative}
h1,h2,.num{font-family:Bahnschrift,'Segoe UI',Arial,sans-serif;font-weight:700}
.bar{position:absolute;left:0;top:0;width:24px;height:1080px;background:#c3d35a}
.eye{font-size:30px;letter-spacing:6px;text-transform:uppercase;color:#c3d35a;font-weight:600}
.glow{position:absolute;right:-300px;top:-300px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,rgba(195,211,90,.16),rgba(195,211,90,0) 65%)}
.frame{position:absolute;border-radius:24px;background:#1a2a20;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px #2c3d31}
.frame img{display:block;width:100%;border-radius:14px}
.hl{position:absolute;border:5px solid #c3d35a;border-radius:14px;box-shadow:0 0 0 6px rgba(195,211,90,.25)}
.logo{position:absolute;right:72px;bottom:56px;display:flex;align-items:center;gap:16px;font-size:26px;color:#9bab9f}
.logo img{width:44px;height:44px}
`;
const logo = `<div class="logo"><img src="../img/logo-p.svg">SuperApp Max · Planta Súper Sacos</div>`;

// Escena con pantallazo: texto a la izquierda, imagen a la derecha y marcos lima sobre lo importante.
function pantalla({ eye, titulo, puntos, img, marcos = [] }) {
  const S = 1.36, W = 800 * S, X = 1920 - 80 - W, Y = 150;
  const hl = marcos.map(([x, y, w, h], i) =>
    `<div class="hl" data-a="fade:f${(0.3 + i * 0.25).toFixed(2)}" style="left:${X + 12 + x * S - 8}px;top:${Y + 12 + y * S - 8}px;width:${w * S + 16}px;height:${h * S + 16}px"></div>`).join('');
  return `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:110px;top:170px;width:${X - 190}px;display:flex;flex-direction:column;gap:28px">
<div data-a="left:0.25" style="display:flex;flex-direction:column;gap:28px"><p class="eye">${eye}</p>
<h2 style="font-size:64px;line-height:1.08">${titulo}</h2></div>
<div style="display:flex;flex-direction:column;gap:22px;margin-top:12px">
${puntos.map((p, i) => `<div data-a="left:${(1.0 + i * 0.35).toFixed(2)}" style="display:flex;gap:18px;align-items:flex-start"><div style="flex:none;width:16px;height:16px;border-radius:50%;background:#c3d35a;margin-top:14px"></div><p style="font-size:32px;line-height:1.35;color:#cfdcd2">${p}</p></div>`).join('')}
</div></div>
<div class="frame" data-a="right:0.55" style="left:${X}px;top:${Y}px;width:${W + 24}px"><img src="../img/${img}.jpg"></div>${hl}${logo}`;
}

const escenas = [
  {
    id: '01-portada',
    voz: 'Súper App Max. La producción de la Planta Súper Sacos, hora a hora, en tiempo real.',
    html: `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:150px;top:250px;display:flex;flex-direction:column;gap:36px">
<img data-a="up:0.2" src="../img/logo-p.svg" style="width:120px;height:120px">
<p class="eye" data-a="left:0.6">Poliplastics · Planta Súper Sacos</p>
<h1 data-a="left:0.9" style="font-size:150px;line-height:1">SuperApp <span style="color:#c3d35a">Max</span></h1>
<p data-a="up:1.4" style="font-size:46px;color:#bfd0c3">La producción, hora a hora y en tiempo real.</p></div>`,
  },
  {
    id: '02-antes',
    voz: 'Antes, el bi-horario se llenaba en papel y después se pasaba a Excel. Los datos llegaban tarde, y no sabíamos con certeza la eficiencia real de cada persona, ni cuánto se perdía por tiempos muertos.',
    html: `<div class="bar"></div>
<div style="position:absolute;left:150px;top:150px;width:1620px;display:flex;flex-direction:column;gap:56px">
<div data-a="up:0.25" style="display:flex;flex-direction:column;gap:56px"><p class="eye">Antes</p>
<h2 style="font-size:84px;line-height:1.08">Datos en papel, que llegaban tarde</h2></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:36px">
${[['Papel y Excel', 'El bi-horario se llenaba a mano y se transcribía después.'], ['Al día siguiente', 'Los resultados llegaban cuando ya no se podía corregir el turno.'], ['Sin detalle', 'Ni eficiencia real por persona, ni el costo de los tiempos muertos.']].map(([t, d], i) =>
      `<div data-a="up:${(0.9 + i * 0.3).toFixed(2)}" style="background:#17261d;border:2px solid #2c3d31;border-radius:24px;padding:48px;display:flex;flex-direction:column;gap:20px"><div style="width:64px;height:8px;border-radius:4px;background:#e0795b"></div><h2 style="font-size:46px">${t}</h2><p style="font-size:32px;line-height:1.4;color:#bfd0c3">${d}</p></div>`).join('')}
</div></div>${logo}`,
  },
  {
    id: '03-que-es',
    voz: 'Súper App Max reúne todo en una sola aplicación web, que funciona en el celular. Tiene cuatro módulos: Bi-horario, Métodos y Tiempos, Personal, y Mi Marcador.',
    html: `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:150px;top:150px;width:1620px;display:flex;flex-direction:column;gap:56px">
<div data-a="up:0.25" style="display:flex;flex-direction:column;gap:56px"><p class="eye">Ahora</p>
<h2 style="font-size:84px;line-height:1.08">Una sola app, en el celular</h2></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:30px">
${[['Bi-horario', 'Producción por hora, por persona y por operación.'], ['Métodos y Tiempos', 'Tiempos estándar y metas por referencia.'], ['Personal', 'Operarios, líneas, grupos y niveles.'], ['Mi Marcador', 'Cada operario ve su eficiencia en vivo.']].map(([t, d], i) =>
      `<div data-a="up:${(0.9 + i * 0.25).toFixed(2)}" style="background:#17261d;border:2px solid #2c3d31;border-radius:24px;padding:44px;display:flex;flex-direction:column;gap:22px"><p class="num" style="font-size:72px;color:#c3d35a">0${i + 1}</p><h2 style="font-size:42px">${t}</h2><p style="font-size:30px;line-height:1.4;color:#bfd0c3">${d}</p></div>`).join('')}
</div></div>${logo}`,
  },
  {
    id: '04-piso',
    voz: 'En piso, el supervisor abre el turno, y anota cada hora lo que produjo cada operario, en cada operación. Si hubo una parada, marca la causa y los minutos.',
    html: pantalla({ eye: 'En piso · Bi-horario', titulo: 'Se anota cada hora, por persona', img: 'hoja', puntos: ['Producción de cada operario, en cada operación.', 'Paradas con su causa y sus minutos.', 'El cuello de botella sale solo.'], marcos: [[24, 420, 738, 50], [14, 298, 760, 28]] }),
  },
  {
    id: '05-pedido',
    voz: 'Cada referencia se agrega con su número de pedido. Así sabemos exactamente qué se fabricó para cada cliente.',
    html: pantalla({ eye: 'Trazabilidad', titulo: 'Cada referencia, con su pedido', img: 'pedido', puntos: ['Se busca por número de pedido.', 'Trae la referencia, el cliente y sus metas.', 'Lo fabricado queda ligado al pedido.'], marcos: [[127, 113, 532, 30], [128, 155, 516, 40]] }),
  },
  {
    id: '06-vista',
    voz: 'Desde la oficina, la vista general del día muestra todas las líneas, cada operación hora a hora, y la eficiencia de la planta, sin esperar al cierre del turno.',
    html: pantalla({ eye: 'Desde la oficina', titulo: 'Toda la planta, en vivo', img: 'vg', puntos: ['Todas las líneas y turnos del día.', 'Cada operación, hora a hora.', 'Eficiencia de la planta al momento.'], marcos: [[526, 198, 247, 82]] }),
  },
  {
    id: '07-personas',
    voz: 'También vemos la eficiencia de cada persona, por línea y por supervisor, y cuántos operarios están por encima del noventa por ciento.',
    html: pantalla({ eye: 'Personas', titulo: 'La eficiencia de cada operario', img: 'efic', puntos: ['Por línea y por supervisor.', 'Las operaciones que hizo cada uno.', 'Cuántos están en 90 % o más.'], marcos: [[526, 237, 247, 62], [626, 360, 140, 40]] }),
  },
  {
    id: '08-pedidos',
    voz: 'Al buscar un pedido, la aplicación muestra cuánto se ha fabricado, cuánto falta, y en qué turnos se hizo.',
    html: pantalla({ eye: 'Pedidos', titulo: '¿Cuánto va de un pedido?', img: 'pedidos', puntos: ['Fabricado y pendiente.', 'En qué turnos, líneas y fechas.', 'Con la eficiencia de cada turno.'], marcos: [[14, 261, 760, 82]] }),
  },
  {
    id: '09-marcador',
    voz: 'Los operarios entran con su cédula a Mi Marcador, y ven su propia eficiencia en vivo, su meta por hora, y su evolución. Eso motiva, y da transparencia.',
    html: pantalla({ eye: 'Para los operarios', titulo: 'Mi Marcador', img: 'mm', puntos: ['Entran con su cédula, sin usuario.', 'Su eficiencia de hoy, en vivo.', 'Su meta por hora y su evolución.'], marcos: [[30, 136, 200, 100]] }),
  },
  {
    id: '10-decidir',
    voz: 'Con estos datos reales, actualizamos los tiempos estándar de Métodos y Tiempos, sacamos informes de tiempos muertos con las unidades que se dejaron de fabricar, y cargamos pedidos, plan y programación del personal desde los mismos archivos de siempre.',
    html: `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:150px;top:150px;width:1620px;display:flex;flex-direction:column;gap:56px">
<div data-a="up:0.25" style="display:flex;flex-direction:column;gap:56px"><p class="eye">Datos para decidir</p>
<h2 style="font-size:84px;line-height:1.08">Lo que se anota en piso alimenta todo</h2></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:36px">
${[['Tiempos estándar', 'Se ajustan con lo que de verdad se produce por hora.'], ['Tiempos muertos', 'Informe en Excel por causa, por línea y unidades perdidas.'], ['Cargar archivos', 'Pedidos, plan y programación, desde los Excel de siempre.']].map(([t, d], i) =>
      `<div data-a="up:${(0.9 + i * 0.3).toFixed(2)}" style="background:#17261d;border:2px solid #2c3d31;border-radius:24px;padding:48px;display:flex;flex-direction:column;gap:20px"><div style="width:64px;height:8px;border-radius:4px;background:#c3d35a"></div><h2 style="font-size:46px">${t}</h2><p style="font-size:32px;line-height:1.4;color:#bfd0c3">${d}</p></div>`).join('')}
</div></div>${logo}`,
  },
  {
    id: '11-cifras',
    voz: 'En sus primeras dos semanas: setenta y cuatro turnos, siete líneas, ciento treinta y cinco operarios, más de cinco mil registros hora a hora, y cerca de veintiún mil sacos reportados.',
    html: `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:150px;top:140px;width:1620px;display:flex;flex-direction:column;gap:60px">
<p class="eye" data-a="left:0.2">Primeras dos semanas · desde el 16 de octubre</p>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px">
${[['74', 'turnos'], ['7', 'líneas'], ['135', 'operarios'], ['5.336', 'registros hora a hora'], ['20.924', 'sacos reportados'], ['54.315', 'registros históricos en Mi Marcador']].map(([n, t], i) =>
      `<div data-a="up:${(0.5 + i * 0.3).toFixed(2)}" style="background:#17261d;border:2px solid #2c3d31;border-radius:24px;padding:44px 48px;display:flex;flex-direction:column;gap:8px"><p class="num" style="font-size:120px;line-height:1;color:#c3d35a">${n}</p><p style="font-size:34px;color:#cfdcd2">${t}</p></div>`).join('')}
</div></div>${logo}`,
  },
  {
    id: '12-cierre',
    voz: 'Los siguientes pasos: que todos los turnos se cierren a tiempo, recordatorios automáticos a los supervisores, y llevar la herramienta a todas las líneas. Súper App Max: datos reales, para decidir mejor.',
    html: `<div class="glow"></div><div class="bar"></div>
<div style="position:absolute;left:150px;top:150px;width:1620px;display:flex;flex-direction:column;gap:48px">
<p class="eye" data-a="left:0.2">Siguientes pasos</p>
<div style="display:flex;flex-direction:column;gap:26px">
${['Todos los turnos cerrados a tiempo.', 'Recordatorios automáticos a los supervisores.', 'La herramienta en todas las líneas.'].map((t, i) =>
      `<div data-a="left:f${(0.05 + i * 0.2).toFixed(2)}" style="display:flex;gap:36px;align-items:center"><p class="num" style="font-size:80px;color:#c3d35a;width:80px">${i + 1}</p><p style="font-size:52px">${t}</p></div>`).join('')}
</div>
<div data-a="up:f0.7" style="margin-top:40px;display:flex;align-items:center;gap:32px"><img src="../img/logo-p.svg" style="width:96px;height:96px"><h1 style="font-size:84px">SuperApp <span style="color:#c3d35a">Max</span></h1><p style="font-size:42px;color:#bfd0c3;margin-left:24px">Datos reales para decidir mejor.</p></div>
</div>`,
  },
];

const CAPAS = `<script>const L=location.hash.slice(1);const st=document.createElement('style');st.textContent=L==='base'?'[data-l]{visibility:hidden}':L?'body{background:transparent!important}body *{visibility:hidden}[data-l="'+L+'"],[data-l="'+L+'"] *{visibility:visible}':'';document.head.appendChild(st);</script>`;
const meta = {};
for (const e of escenas) {
  let n = 0; const capas = [];
  const html = e.html.replace(/data-a="(\w+):(f?[\d.]+)"/g, (_, fx, t) => { capas.push({ fx, t }); return `data-l="${++n}"`; });
  meta[e.id] = capas;
  fs.writeFileSync(path.join(OUT, e.id + '.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body>${html}${CAPAS}</body></html>`);
  const txt = path.join(OUT, e.id + '.txt');
  if (!fs.existsSync(txt)) fs.writeFileSync(txt, e.voz, 'utf8'); // el guion ya ajustado a mano no se pisa
}
fs.writeFileSync(path.join(OUT, 'capas.json'), JSON.stringify(meta, null, 1));
console.log(Object.entries(meta).map(([k, v]) => k + ':' + v.length).join(' '));
