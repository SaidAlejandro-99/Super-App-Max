# Módulo 3 — Mi Marcador

Tarjeta de eficiencia del operario. Es la cara pública de SuperApp Max.

## Cómo se entra

- La app abre con dos ingresos: **Supervisores y administrativos** (correo y
  contraseña) y **Soy operario** (Mi Marcador).
- El operario escribe su **cédula completa** y ve solo su tarjeta. No hay lista
  desplegable ni sugerencias. Tras 5 intentos fallidos se hace una pausa de 30 s.
- Enlace directo: `…/#marcador`.
- Dentro de la app (admin y supervisores) la pestaña **Mi Marcador** busca por
  nombre y abre la misma tarjeta.

## Seguridad

- La parte pública no lee tablas. Solo llama dos funciones de la base de datos:
  `mm_portada()` (frase, destacado y Top 10) y `mm_tarjeta(cedula)` (una tarjeta).
- Ninguna de las dos devuelve cédulas ni datos de otras personas.
- El histórico (`mm_historico`) solo lo leen supervisores y admin, y solo el
  admin lo escribe.

## Qué muestra la tarjeta

- Nombre, línea, **nivel** (1, 2 o 3), **polivalente** y **ranking** de costura del mes.
- **Hoy, en vivo**: el turno del Bi-horario donde está asignado (hoy, o el de
  ayer si sigue abierto).
  - Eficiencia del día (mismo cálculo del Bi-horario) y meta por hora con el
    ajuste de polivalencia.
  - Lo que lleva frente a lo esperado, lo que le falta para la meta del turno
    (si estuvo en una sola operación), barras por hora y tiempos muertos.
  - Se actualiza con el botón **Actualizar**.
- Eficiencia del mes con su diferencia frente al mes anterior, y la del histórico completo.
- **Curva de aprendizaje** por mes, con línea de tendencia y la línea del bono (90 %).
  - Tendencia: ajuste cuadrático. Si sube más de 3 puntos, mejorando (verde);
    si baja más de 3, bajando (rojo); si no, estable (azul).
- **Habilidades de costura**: registros por operación, con barra hasta 30.
- Día a día del mes en curso y del anterior.

## Reglas

- **Eficiencia**: promedio simple de los registros (un registro = una persona,
  un día, una operación). Las ausencias no entran.
- **Polivalente**: solo costura; 3 o más operaciones de costura con 30
  registros o más cada una.
  - Al que no lo es se le muestra "¿Cómo ser polivalente?", con su avance y el beneficio (subir de nivel).
- **Ranking / Top 10**: costura del mes en curso (el mes del último dato
  cargado). Cuenta solo a los operarios activos con 5 registros o más en el mes.
- **Nivel**: solo lo cambia el admin, en **Personal**. La base de datos lo
  bloquea para cualquier otro usuario.
- **Colores**: verde desde 90 % (donde arranca el bono), amarillo desde 80 %, rojo por debajo.

## De dónde salen los datos

- **Histórico**: el Excel de bi-horarios (hoja `BI HORARIO 2025`). El admin lo
  recarga en Mi Marcador → **Histórico (Excel)**; la carga reemplaza todo lo
  que vino del Excel.
  - Primera carga (21-oct-2026): 54.315 registros, del 20-ene-2025 al 20-oct-2026.
- **Hoy**: el Bi-horario en línea.
- **Destacado y frase**: los cambia el admin en Mi Marcador → **Destacado y frase**.
  La foto se reduce a 240 px y se guarda en `config`.

## Pendiente

- Cuando todas las líneas estén en el Bi-horario, alimentar el histórico
  automáticamente al **Terminar** cada turno y dejar de cargar el Excel.
