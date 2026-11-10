-- Operaciones con reglas especiales en el Bi-horario:
-- - pareja: Revisión, siempre 2 personas que revisan el mismo saco. Se anota una
--   cantidad por hora para la pareja y las dos quedan con la misma eficiencia
--   (en la base cada una lleva la cantidad de la pareja).
-- - meta_origen 'promedio': Pie de máquina y Líder de manguita no se miden hora a
--   hora; su eficiencia es la del grupo que acompañan (ref = 'DD5' o 'manguita').
-- - area 'manguita': subárea de la hoja donde se anota por persona y luego sus operaciones.
alter table bh_bloques add column if not exists pareja boolean not null default false;
alter table bh_bloques add column if not exists area text;
alter table bh_bloques add column if not exists ref text;

alter table bh_bloques drop constraint if exists bh_bloques_meta_origen_check;
alter table bh_bloques add constraint bh_bloques_meta_origen_check
  check (meta_origen = any (array['estudio', 'manual', 'turno', 'promedio']));

insert into operaciones (nombre, familia, tipo, updated_at) values
  ('Pie de máquina', 'Revisión y prensa', 'Manual', now()),
  ('Líder manguita', 'Otras', 'Manual', now())
on conflict (nombre) do nothing;
