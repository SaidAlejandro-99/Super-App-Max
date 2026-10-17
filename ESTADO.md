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

## Lo que SIGUE (siguiente paso concreto)

**Construir el Módulo 2 (Bi-horario).** Está pendiente **una sola cosa de Said:
la foto de la hoja del Bi-horario** que los supervisores llenan a mano cada hora.
Con esa foto se define:
- qué se anota cada hora (código, operario, cantidad/unidades, línea, turno…),
- cómo está organizada la hoja,
- qué totales/cuentas se sacan.

Y con eso se diseña la tabla definitiva (`biorario_registros` ya tiene una base)
y la pantalla para que el supervisor lo digite igual que en el papel.

Después del Bi-horario quedan, en orden: publicar la app en internet (Netlify)
para que los supervisores entren desde el celular, cargar un plan de producción
nuevo cuando cambie el MAESTRO_PROG y conectar el Módulo 3 (eficiencia).

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
