-- Mesas de revisión: la revisión es del turno (revisa los sacos de todas las referencias).
-- El supervisor elige 1, 2 o 3 mesas (cada una es una pareja) y reparte entre ellas la meta
-- del turno. Cada mesa es un bloque con meta_origen 'mesa', su número y sus sacos del turno;
-- meta_hora = sacos de la mesa ÷ horas del turno, así Mi Marcador la mide como cualquier otra.
alter table bh_bloques add column if not exists mesa smallint check (mesa between 1 and 3);
alter table bh_bloques add column if not exists meta_mesa numeric check (meta_mesa > 0);
alter table bh_bloques drop constraint if exists bh_bloques_meta_origen_check;
alter table bh_bloques add constraint bh_bloques_meta_origen_check
  check (meta_origen = any (array['estudio', 'manual', 'turno', 'promedio', 'mesa']));
