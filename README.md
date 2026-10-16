# SuperApp Integrada — Planta Súper Sacos (Poliplastics S.A.S.)

Sistema de 3 módulos conectados: Métodos y Tiempos, Biorario y SuperApp de eficiencia.
Ver el plano de planeación completo (visión, roles, costos, hoja de ruta) en el documento
del proyecto en Claude.

## Estado actual

- [x] Módulo 1 — Métodos y Tiempos: datos migrados a Supabase (182 operaciones, 294 códigos, 3.197 tiempos, 84 de producción futura) y panel web completo (resumen, edición de tiempos, cronómetro, homologar, imagen de costura, Excel).
- [ ] Módulo 2 — Biorario: pendiente (a partir de la hoja manual de los supervisores).
- [ ] Módulo 3 — SuperApp (eficiencia): ya existe en https://eficienciaplantasupersacos.netlify.app/, pendiente de conectar al final.

## Crear el primer administrador

La app pide usuario y contraseña. Para tener el primer acceso:

1. En Supabase: **Authentication → Users → Add user** (correo + contraseña). Copia el `User UID` que queda.
2. En **SQL Editor**, registra su rol (reemplaza el UID y el nombre):

   ```sql
   insert into perfiles (id, nombre, rol)
   values ('PEGA_AQUI_EL_UID', 'Said Meléndez', 'admin');
   ```

3. Ya puedes entrar con ese correo y contraseña.

## Cómo está armado

- `src/` — código de la app (vanilla JS + Vite).
- `supabase/schema.sql` — las tablas de la base de datos. Se corre una vez dentro de Supabase (SQL Editor) para crear la bodega de datos.
- `.env.example` — copiar a `.env` y poner ahí la URL y la clave pública del proyecto Supabase (Settings → API).

## Primeros pasos para dejarlo corriendo

1. Crear el proyecto en [supabase.com](https://supabase.com) (gratis).
2. Entrar al proyecto → **SQL Editor** → pegar el contenido de `supabase/schema.sql` → Run.
3. Entrar a **Settings → API** → copiar `Project URL` y `anon public key` al archivo `.env`.
4. `npm install`
5. `npm run dev`

## Roles

| Rol | Entra con | Puede |
| --- | --- | --- |
| Operario | Libre, sin clave | Ver su histórico y el ranking (Módulo 3) |
| Supervisor | Usuario y clave | Digitar el Biorario (Módulo 2) |
| Administrador | Usuario y clave | Todo, incluido Métodos y Tiempos (Módulo 1) |
