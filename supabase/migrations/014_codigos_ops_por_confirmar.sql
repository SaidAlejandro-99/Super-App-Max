-- Un código al que se le agregan operaciones desde el Bi-horario no queda
-- "completo" por eso: puede faltarle otras operaciones de costura. Queda
-- marcado hasta que el admin confirme que están todas.
alter table codigos add column if not exists ops_por_confirmar boolean not null default false;
