# Estado del proyecto — SuperApp Max (Planta Súper Sacos)

> Este archivo es el "relevo": resume en qué va el proyecto para que cualquiera
> (una persona o una nueva sesión de Claude Code) retome sin perder el hilo.
> Última actualización: 2026-10-16.

## Qué es

App web para la Planta Súper Sacos de Poliplastics S.A.S. con **3 módulos**:

1. **Módulo 1 — Métodos y Tiempos** (admin): consulta y edición de los tiempos
   estándar por código de referencia. **← lo que ya está construido.**
2. **Módulo 2 — Bi-horario** (supervisor): digitalizar la hoja que hoy los
   supervisores llenan a mano cada hora con la producción real. **← lo siguiente.**
3. **Módulo 3 — SuperApp de eficiencia** (operarios, acceso libre): ranking y
   eficiencia. Ya existe aparte en https://eficienciaplantasupersacos.netlify.app/
   y se conectará al final, cuando el Bi-horario tenga datos.

La fórmula que une todo: **Eficiencia = Producción real (Módulo 2) ÷ Meta (Módulo 1).**

## Qué YA está hecho

- **Base de datos en Supabase** (proyecto "Super App Max", ref `tswwuuoayeprvtfcxvdu`),
  con el esquema de `supabase/schema.sql` aplicado y los datos migrados:
  - `operaciones`: 182
  - `codigos`: 294
  - `tiempos`: 3.197 (152 códigos con tiempos; incluye 13 filas con muestras de
    cronómetro que Said midió en vivo — datos reales, no de la foto vieja)
  - `planning`: 84 códigos de producción futura (foto del MAESTRO_PROG, corte 2026-10-05),
    y `config`, que guarda la fecha de corte del plan
  - `perfiles`: 1 usuario (Said, `admin`). `biorario_registros`: creada, aún vacía
  - Función `guardar_tiempos(codigo, filas)`: reemplaza en un solo paso los tiempos
    de un código (la usa la app al editar). Cambios de esquema en `supabase/migrations/`.
  - Seguridad RLS activa: lectura para usuarios autenticados; escritura de
    tiempos/códigos/operaciones solo `admin`; escritura de biorario `admin` o `supervisor`.
- **Frontend del Módulo 1 completo** (Vite + JS puro + @supabase/supabase-js), con la
  misma apariencia y funciones que el panel-artefacto original "Tiempos y Movimientos SS":
  - Pestañas Resumen, Códigos, Producción futura y Operaciones
  - Edición de tiempos, cronómetro (TO × valoración × suplementos), homologar desde otro
    código, imagen de costura para WhatsApp, exportar a Excel y tema claro/oscuro
  - Login con Supabase Auth; el rol `admin` edita y cualquier otro rol ve en solo lectura
  - Verificado el 2026-10-16: los indicadores coinciden con el artefacto
    (294 códigos, 150 completos, 84 en producción futura, 69 % cubierto)
  - El artefacto original queda como respaldo; **desde ahora se edita aquí**
    para no tener los datos en dos sitios.

- **Módulo 2 — Bi-horario** (2026-10-16): turnos por línea, hoja por referencia,
  bloques por operación con meta (Módulo 1 o manual), registro por hora con
  tiempos muertos, eficiencia, cuello de botella, bloques que se contraen y
  cierre del turno. Diseño y decisiones en `docs/BIHORARIO.md`.
- **Módulo 3 — Mi Marcador** (2026-10-22): la app abre con dos ingresos
  (supervisores/administrativos y "Soy operario"). El operario entra con su
  cédula y ve su tarjeta: turno en vivo, curva de aprendizaje, habilidades,
  polivalencia y día a día en calendario. Histórico cargado desde el Excel de
  bi-horarios (54.315 registros) y niveles 1-3 (solo el admin los cambia, en
  Personal). Detalle en `docs/MI_MARCADOR.md`.
- **Bi-horario**: turnos 4 y 5 con 11 casillas (sin la hora de almuerzo) y
  vista "Eficiencia por persona" que abre el Mi Marcador de cada operario.
- **Personal**: 239 operarios activos y 6 supervisores cargados desde el Excel
  de programación de Said (sin retirados ni administrativos).
- **Publicada** en https://superapp-max.netlify.app (Netlify, plan gratis,
  300 créditos/mes compartidos con la app de eficiencia).
  - Se publica **a mano** y solo cuando Said aprueba una versión: cada
    publicación gasta 15 créditos. El sitio no está ligado a GitHub a propósito.
  - Para publicar: `deploy-site` del conector de Netlify (site id
    `76bd75f6-cb0b-4444-86ef-5a9568057588`). Las variables `VITE_SUPABASE_*`
    están configuradas en el sitio.
- **Usuarios**: Said (`admin`) y Madais Santana (`supervisor`, piloto del
  Bi-horario). Los usuarios se crean en Supabase → Authentication y luego se
  liga su perfil (rol y cédula de supervisor) en la tabla `perfiles`.

## Lo que SIGUE (siguiente paso concreto)

**Piloto del Bi-horario con Madais.** Los turnos de prueba ya se borraron
(17-oct-2026): el Bi-horario arranca limpio. Ajustar con lo que salga del piloto.

Después, en orden: crear usuarios de los demás supervisores, cargar un plan de
producción nuevo cuando cambie el MAESTRO_PROG y construir el Módulo 3
(eficiencia para operarios) dentro de esta app, liviano para no pasar los
límites gratis de Supabase.

## Cómo dejarlo corriendo en el computador

1. Tener el repo clonado (`Super-App-Max`).
2. Copiar `.env.example` a `.env` y llenar con los datos del proyecto Supabase
   (Settings → API):
   ```
   VITE_SUPABASE_URL=https://tswwuuoayeprvtfcxvdu.supabase.co
   VITE_SUPABASE_ANON_KEY=  (la clave "publishable" de Supabase)
   ```
   > La clave publishable es pública por diseño (la protege RLS); aun así vive solo
   > en `.env`, que está en `.gitignore` y nunca se sube al repo.
3. `npm install`
4. `npm run dev` y abrir la dirección local que muestra.

## Primer usuario administrador

La app pide correo y contraseña. Para el primer acceso, ver la sección
"Crear el primer administrador" en el `README.md`.
