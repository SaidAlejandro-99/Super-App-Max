-- Ajustes del piloto del Bi-horario (20-oct-2026). Ver docs/BIHORARIO.md.

-- Meta del turno: una por línea, la escribe el supervisor al abrir.
alter table bh_turnos add column if not exists meta_turno numeric;

-- Cierre: unidades fabricadas de cada referencia, escritas a mano al terminar.
alter table bh_hojas add column if not exists unidades_reportadas numeric;

-- Operaciones calificadas con la meta del turno (revisión, patinador):
-- su eficiencia = unidades reportadas del turno / meta del turno.
alter table bh_bloques drop constraint if exists bh_bloques_meta_origen_check;
alter table bh_bloques add constraint bh_bloques_meta_origen_check
  check (meta_origen in ('estudio', 'manual', 'turno'));

-- Polivalencia: cuando un operario pasa a otra operación en el mismo turno,
-- el supervisor pondera su meta (0.5, 0.75, 0.9 o 1 = sin ajuste).
alter table bh_asignaciones add column if not exists factor numeric not null default 1
  check (factor > 0 and factor <= 1);

-- Patinador no existía en el catálogo de operaciones.
insert into operaciones (nombre, familia, tipo) values ('Patinador', 'Traslado y montaje', 'Manual')
on conflict (nombre) do nothing;
