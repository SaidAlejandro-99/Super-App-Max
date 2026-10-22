-- Perfil de solo lectura ('visita'), por ejemplo para gerencia: tiene su nombre
-- en la app pero no edita nada. Sin perfil también entra como solo lectura.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (rol in ('admin', 'supervisor', 'visita'));
