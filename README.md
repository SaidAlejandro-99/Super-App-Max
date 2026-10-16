# SuperApp Integrada — Planta Súper Sacos (Poliplastics S.A.S.)

Sistema de 3 módulos conectados: Métodos y Tiempos, Biorario y SuperApp de eficiencia.
Ver el plano de planeación completo (visión, roles, costos, hoja de ruta) en el documento
del proyecto en Claude.

## Estado actual

- [x] Módulo 1 — Métodos y Tiempos: funcional como artefacto en Claude, en migración aquí.
- [ ] Módulo 2 — Biorario: en construcción.
- [ ] Módulo 3 — SuperApp (eficiencia): ya existe en https://eficienciaplantasupersacos.netlify.app/, pendiente de conectar al final.

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
