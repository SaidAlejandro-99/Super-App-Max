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

## Ajustes del 27-oct-2026

- **Turnos de 12 h (4 y 5):** 11 casillas. No se muestra la hora de almuerzo
  (`turnos_def.descanso`: 13 en el turno 4, 1 en el turno 5), salvo que ese turno
  ya tenga algo registrado en esa hora.
- **Eficiencia por persona:** vista del turno con la eficiencia de cada operario.
  El nombre abre su Mi Marcador.
- **Cambio de referencia sin castigo:** si en una misma hora la persona pasa por
  dos referencias u operaciones, la hora cuenta una sola vez.
  - Sus minutos se reparten según el tiempo estándar ganado en cada parte (unidades ÷ meta).
  - El tiempo muerto de esa hora es el mayor que se anotó.
  - Ejemplo: 10 de meta 20 y 8 de meta 18 dan 0,5 + 0,44 = 94 %.
- **Mismas personas al cambiar de referencia:** al agregar una operación en una
  referencia nueva, la app ofrece las personas que tenía esa operación en la
  referencia anterior, con su mismo ajuste de meta.
  - El ajuste de polivalencia solo se pregunta cuando la persona cambia de operación.
- **Prensa y Liner (producto terminado):** no usan hojas por referencia.
  - Cada persona anota lo que hizo: referencia (salen primero las trabajadas en
    la planta en los últimos 2 días), presentación y cantidad.
  - También se anota el tiempo que estuvo fuera del proceso (manualidad o tiempo muerto).
  - Metas por hora: prensa 125 en pallet y 60 en bulto; liner 40.
  - Eficiencia de la persona = tiempo estándar de lo que hizo ÷ tiempo en el proceso
    (lo que lleva el turno, o todo si ya terminó, menos el tiempo fuera).
  - Tablas: `bh_pt` (producción) y `bh_pt_personas` (personas y tiempo fuera).

## Tiempos desde el Bi-horario (27-oct-2026)

Pestaña **Desde Bi-horario** en Métodos y Tiempos. Compara la producción por hora
real con el tiempo estándar, y el admin actualiza con un clic.

- Solo cuentan las **horas limpias**:
  - con unidades;
  - sin tiempo muerto ni llegada tarde;
  - la persona en una sola operación esa hora;
  - sin ajuste de polivalencia (factor 1);
  - con meta por hora (no la del turno).
- Función `mt_desde_bihorario(desde, hasta)` en la base de datos.
- **Criterio:**
  - por defecto, la **mediana** de las unidades por hora;
  - opcional, el percentil 75 (ritmo de los mejores) o el promedio.
- **Tiempo nuevo** = 60 ÷ unidades por hora.
  - La hora real ya incluye pausas y fatiga, así que no se aplican valoración ni suplementos aparte.
- **Mínimo para actualizar:** 6 horas limpias, de 2 personas o más, en 2 turnos o más.
  - Se avisa si todas las horas tienen el mismo número, porque puede ser que no se haya medido hora por hora.
- **Al actualizar:**
  - Si la operación tiene varias partes en el estudio, se ajustan todas en la misma proporción.
  - Las tomas de cronómetro de esa operación se reemplazan.
  - En `tiempos.fuente` queda de dónde salió el tiempo (criterio, horas, personas y fechas).
- **Ajuste (27-oct):**
  - La pestaña muestra solo operaciones de **costura**, agrupadas por **cliente**.
  - Cada fila lleva un estado: **Sin estudio**, **Más rápido** (conviene actualizar), **Más lento** o **Al día**.
    - Más lento: actualizar bajaría la exigencia, así que se recomienda cronometrar antes.
  - Por defecto solo se ven las filas para actualizar (sin estudio o más rápido).
  - Se avisa cuando lo anotado es igual a la meta, porque puede que se haya escrito la meta y no lo producido.
- **Código por confirmar (27-oct):** actualizar unas operaciones no completa el código.
  - Si desde el Bi-horario se agrega una operación nueva a un código, queda
    marcado `codigos.ops_por_confirmar` y sale **incompleto**.
  - Sigue así hasta que el admin abra el código y toque **"Ya están todas las operaciones"**.
  - El editor muestra qué otras operaciones de costura aparecen en el Bi-horario para ese código.
- **Unidades a mano y descartar (27-oct):**
  - Al actualizar, las unidades por hora vienen del Bi-horario, pero el admin puede escribir otro número.
    - Si lo cambia, en `tiempos.fuente` queda "Manual" junto con lo que sugería el Bi-horario.
  - **Descartar** quita de la lista una fila que no va (código y operación).
    - Se guarda en `config.mt_bh_descartes` y se recupera con el filtro "Descartados".

## Lista del Bi-horario (28-oct-2026)

- Tres vistas arriba:
  - **Turnos:** por línea, en orden fijo, con los turnos de cada línea lado a lado
    por hora. Filtro: todos, en curso o terminados.
  - **Vista general del día:** todos los turnos de la fecha escogida (en curso y terminados), por línea y
    operación (llevan, esperado, eficiencia, personas, hasta qué hora y cuello).
    - Los turnos de días anteriores que no se terminaron se avisan aparte.
  - **Personas:** eficiencia del día de cada operario, sumando todos sus turnos y
    operaciones (tiempo estándar ganado ÷ tiempo disponible), con filtros por
    línea y supervisor.
- **Tarjetas:** sin barra de progreso ni lista de operaciones.
  - Al terminar el turno, lo **fabricado** sale resaltado (y el % frente a la meta del turno).
- **Supervisores nuevos:** Kewill Figueroa y Willian Tarazona.
- Los catálogos (supervisores, turnos, personal) se vuelven a pedir al iniciar
  sesión y nunca se guardan vacíos.

## Cargar archivos (28-oct-2026)

Pestaña **Cargar archivos** en Métodos y Tiempos (solo admin, desde el PC).
El Excel se lee en el computador y solo se suben las columnas que usa la app. No se suben precios.

| Archivo | Hoja | Qué se guarda | Para qué |
|---|---|---|---|
| PLANNING SUPER SACOS (.xlsm) | BDD ANGIE V2 | pedidos con código → `pedidos` (origen `bdd`) | buscar la referencia por número de pedido |
| SUPERSACOS (.xlsx) | MAESTRO_PROG | pedidos → `pedidos` (origen `plan`); los no entregados, por código → `planning` | Producción futura y búsqueda por pedido |
| NOVEDADES NÓMINA (.xlsx) | Prog. Personal | línea, grupo, rol y operación → `operarios`; turno por día (de ayer a 14 días) → `programacion` | priorizar personas en el Bi-horario |

- Cada carga reemplaza lo anterior de ese archivo.
- Los códigos de los pedidos que no existían se crean en `codigos` (sin tiempos), para poder usarlos en el Bi-horario.
- **Prioridad al escoger personas:**
  1. Programadas en ese turno ese día.
  2. Del grupo del supervisor (el grupo es su nombre de pila; MAQ 1 a 4 son de Kewil; FIJO rotan).
  3. De la línea.
  - Las que están en vacaciones, incapacidad o licencia van al final, marcadas.
- **Referencia por pedido (28-oct):**
  - "Agregar referencia" pide el **número de pedido** y toma su código.
  - Si el pedido no está cargado, "Agregar con la referencia" deja escoger el código y guarda el número escrito.
  - El pedido queda en `bh_hojas.pedido`.
- **Vista Pedidos:** buscas un pedido y salen todos los turnos donde se trabajó, con lo fabricado
  (lo reportado al terminar el turno, o la salida si sigue abierto), contra la cantidad del pedido.
  - Las referencias agregadas antes, sin pedido, cuentan "por código" solo dentro de las fechas
    del pedido: de 30 días antes de recibirlo a 7 días después de la entrega.
- **Cargas:**
  - Si cambian el nombre de la hoja (V3, 2027…), se toma la más nueva; las "VIEJA" no.
  - Si un archivo trae menos del 70 % de lo que traía la carga anterior, se pregunta antes de reemplazar.
