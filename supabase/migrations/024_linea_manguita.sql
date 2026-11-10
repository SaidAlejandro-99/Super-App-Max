-- Manguita pasa a ser una línea aparte (no va por referencia de cliente): su turno guarda todo
-- en una sola hoja interna sin código.
alter table bh_hojas alter column codigo drop not null;
