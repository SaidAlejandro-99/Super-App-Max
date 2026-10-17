// Conexión central a Supabase (la bodega de datos + el portero).
// Todos los módulos (Métodos y Tiempos, Bi-horario, SuperApp) importan
// este mismo cliente, así comparten la misma base de datos y el mismo login.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[Supabase] Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env'
  )
}

export const supabase = createClient(url, anonKey)
