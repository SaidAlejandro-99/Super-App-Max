# Módulo 2 — Bi-horario (diseño acordado con Said)

> Documento vivo: recoge lo que se decidió en las conversaciones con Said
> (16-oct-2026) antes de programar. Si algo cambia, se actualiza aquí.
> **El repo es público: aquí no van nombres completos ni cédulas del personal.**
> Esos datos viven solo en Supabase.

## Qué reemplaza

La hoja en papel **PSS-FR-009 "Bihorario de Planta Super Sacos"**: encabezado
(fecha, turno, línea, supervisor, cliente), bloques por operación con los
operarios debajo y una columna por hora real del turno. En cada casilla se
anota lo hecho en la hora y el acumulado. Al pie: personal indirecto
(revisión, amarre, soplado, patinador, pie de máquina) y sacos por cliente.

## Decisiones

### Alcance
- Arranca con las **líneas de ensamble**: Circular, 4 Panel, U-panel y Panel
  (Panel y U-panel son distintas). Portasacos, Cerro Matoso y Container se
  suman cuando Said explique su flujo. Las líneas alternas (prensa, liner,
  corte, perforación, corte de reata…) van después.
- Por ahora **no hay meta de turno ni de línea**: solo la **meta por operario**.
- El tablero en vivo para Said (cómo va cada línea) es una fase posterior.

### Estructura de un turno
- **Turno** = fecha + turno + línea + supervisor. Los turnos que cruzan la
  medianoche llevan la fecha del día en que **inician**.
- Dentro del turno, una **hoja por referencia** (código Dynamics). Si se cambia
  de referencia, se crea otra hoja en el mismo turno.
- Dentro de cada hoja, **bloques por operación**. El supervisor arma los
  bloques y coloca a las personas (solo **activas**).
- Un operario puede aparecer en varias operaciones u hojas del mismo turno.

### Metas
- Al elegir referencia + operación, la meta por hora sale del Módulo 1
  (60 / tiempo estándar).
- Si el Módulo 1 no tiene ese tiempo, el supervisor la escribe a mano y **solo
  vale para ese turno** (no alimenta el Módulo 1).

### Unidades
- Todas las operaciones se cuentan en **sacos**: 12 baffles = 12 sacos en
  proceso. Igual para las preparaciones. Así los totales de las operaciones
  se pueden comparar entre sí.
- **Cuello de botella** = la operación con menor acumulado de la hoja.
  (Los "números en círculo" del papel son ese acumulado por operación.)
- La salida de la línea la marca **pegue tapa** (en Circular depende del pegue
  de fondo).

### Flujo por línea (base; Said lo irá afinando)
- **Circular** (tubo sin costuras verticales): prep. válvula tapa, prep. válvula
  fondo, prep. tapa, prep. fondo, reata / DD5 → pegue fondo → **pegue tapa**.
- **4 Panel**: preparaciones → baffle → cierre → pegue fondo → **pegue tapa** →
  revisión. Algunas referencias llevan pétalos u otras operaciones.
- **U-panel** (la U forma fondo y dos lados; no lleva pegue de fondo): prep.
  válvulas → pegue reata → cierre → **pegue tapa**.
- **Revisores**: van amarrados a pegue tapa. Se evaluarán con una meta de línea
  más adelante (pendiente).

### Eficiencia del operario
- Eficiencia = unidades ÷ (meta/h × horas efectivamente disponibles).
- El **tiempo muerto se descuenta** del tiempo disponible.
- **Manualidad / actividades varias** (barrer, limpiar…): no se mide; se
  descuenta del tiempo disponible y se registra aparte, **no** como pérdida de
  la línea.
- La **llegada tarde se castiga**: se anota, pero no se descuenta.
- Si el **turno termina antes**, esas horas no cuentan.

### Tiempos muertos
- Se usan los códigos oficiales de la planta. Botones rápidos con los 8 más
  usados (Pareto del histórico oct-2025 en adelante, ~92 % del tiempo):
  411 daño mecánico (DM), 425 falta de producto en proceso (FM), 232 falta de
  aire comprimido (daño interno), 110 reuniones/capacitaciones, 441 falta de
  personal, 211 falta de energía (proveedor), 480 falla locativa,
  315 limpieza y sanitización. El resto, en un buscador.
- FM en ensamble = **425** (esperar piezas de otra operación o de corte).
  421 = falta de materia prima (no hay tela en corte).
- Se registran la causa y los minutos, con atajos de 15/30/45/60 y la hora
  completa por defecto.

### Turnos
| Turno | Horario |
|---|---|
| 1 | 6:00 – 14:00 |
| 1-A | 5:00 – 13:00 |
| 2 | 13:00 – 21:00 |
| 3 | 21:00 – 5:00 (el domingo entra a las 19:00) |
| 4 | 6:00 – 18:00 |
| 5 | 18:00 – 6:00 |
| 6 | 7:00 – 17:00 |
| 7 | 7:00 – 16:00 |
| 11 | 6:00 – 18:00 (2×2) |
| 22 | 18:00 – 6:00 (2×2) |

6-A y 6-B son administrativos y no aplican al biorario.

### Personal
- Base inicial: personal **activo** del Excel de programación de Said (los
  retirados no se cargan). Said enviará la lista actualizada cada cierto tiempo.
- En el día a día se puede **agregar** (nombre completo y cédula obligatorios)
  o **retirar** personas desde la app.
- La programación diaria del Excel y las novedades de nómina (vacaciones,
  incapacidades…) **no** se usan por ahora.

### Usuarios y cierre
- Cada supervisor tendrá su propio usuario: Adel, Yamaris, Petra, Madais,
  Alberto y Farid. El piloto arranca con Madais o Yamaris.
- Al final del turno, el supervisor pulsa **"Terminar biorario"**. Puede
  corregirlo hasta **2 días** después; luego solo el admin.
- Uso en planta: tableta (de preferencia) o celular. Guarda sin internet y
  sincroniza cuando vuelve la señal.

## Ajustes del piloto (20-oct-2026)

- **Meta obligatoria** en cada operación: Métodos y Tiempos, manual o, para
  Revisión y Patinador, **meta del turno**.
- **Meta del turno**: una por línea, se escribe al abrir el turno (editable).
  Revisión y Patinador se califican al cierre: unidades fabricadas ÷ meta del turno.
- **Cierre**: el supervisor escribe a mano las unidades fabricadas de cada código
  (sin precarga). Es obligatorio para terminar.
- **Polivalencia (opción A)**: si un operario que ya está en el turno se pone en
  otra operación, la app pregunta a qué porcentaje medirlo: 50 %, 75 %, 90 % o
  sin ajuste. Meta efectiva = meta × porcentaje. Se puede cambiar tocando la etiqueta.
- **Líneas alternas**: nueva línea para liner, prensa y otras operaciones.
- **Tarjetas de la lista**: operaciones clave con unidades y hasta qué hora
  (Pegue tapa / Pegue solapa; en Circular también Pegue reata y DD5), avance contra
  la meta del turno, personas, eficiencia, tiempo muerto y cuello de botella.
- **Vista general** del turno: todas las referencias unidas por operación, con el
  color de la referencia trabajada en cada hora.
- **Proyección al cierre** (botón): total + promedio de las horas que sí tuvieron
  producción × horas que faltan.
- **Eliminar turno** completo: solo el administrador.
- Pendiente: carga de pedidos, planning y personal desde Excel (punto 5).
