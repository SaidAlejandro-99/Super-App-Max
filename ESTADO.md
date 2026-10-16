# Estado del proyecto — SuperApp Integrada (Planta Súper Sacos)

> Este archivo es el "relevo": resume en qué va el proyecto para que cualquiera
> (una persona o una nueva sesión de Claude Code) retome sin perder el hilo.
> Última actualización: 2026-10-15.

## Qué es

App web para la Planta Súper Sacos de Poliplastics S.A.S. con **3 módulos**:

1. **Módulo 1 — Métodos y Tiempos** (admin): consulta y edición de los tiempos
   estándar por código de referencia. **← lo que ya está construido.**
2. **Módulo 2 — Biorario** (supervisor): digitalizar la hoja que hoy los
   supervisores llenan a mano cada hora con la producción real. **← lo siguiente.**
3. **Módulo 3 — SuperApp de eficiencia** (operarios, acceso libre): ranking y
   eficiencia. Ya existe aparte en https://eficienciaplantasupersacos.netlify.app/
   y se conectará al final, cuando el Biorario tenga datos.

La fórmula que une todo: **Eficiencia = Producción real (Módulo 2) ÷ Meta (Módulo 1).**

## Qué YA está hecho

- **Base de datos en Supabase** (proyecto "Super App Max", ref `tswwuuoayeprvtfcxvdu`),
  con el esquema de `supabase/schema.sql` aplicado y los datos migrados:
  - `operaciones`: 182
  - `codigos`: 294
  - `tiempos`: 3.197 (152 códigos con tiempos; incluye 13 filas con muestras de
    cronómetro que Said midió en vivo — datos reales, no de la foto vieja)
  - `perfiles` y `biorario_registros`: creadas, aún vacías
  - Seguridad RLS activa: lectura para usuarios autenticados; escritura de
    tiempos/códigos/operaciones solo `admin`; escritura de biorario `admin` o `supervisor`.
- **Frontend del Módulo 1** (Vite + JS puro + @supabase/supabase-js):
  - Login con Supabase Auth (`src/main.js`)
  - Lista de códigos con buscador (código, cliente, descripción, min de costura, min total, estado)
  - Detalle por código: operaciones con tipo (Costura/Manual), tiempo, und/hora y nº de muestras
  - Estilos con la paleta corporativa (`src/styles.css`): verde #1B4332, verde-claro #A8B826, amarillo #E9A820
  - Por ahora es **solo lectura**; la edición (cronómetro, homologar, imagen de costura)
    está en el panel-artefacto original y se portará aquí más adelante.

## Lo que SIGUE (siguiente paso concreto)

**Construir el Módulo 2 (Biorario).** Está pendiente **una sola cosa de Said:
la foto de la hoja del biorario** que los supervisores llenan a mano cada hora.
Con esa foto se define:
- qué se anota cada hora (código, operario, cantidad/unidades, línea, turno…),
- cómo está organizada la hoja,
- qué totales/cuentas se sacan.

Y con eso se diseña la tabla definitiva (`biorario_registros` ya tiene una base)
y la pantalla para que el supervisor lo digite igual que en el papel.

Después del Biorario quedan, en orden: edición completa del Módulo 1 aquí,
y conectar el Módulo 3 (eficiencia) a estos datos.

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
