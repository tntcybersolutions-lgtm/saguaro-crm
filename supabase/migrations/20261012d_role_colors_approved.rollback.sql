-- Rollback for 20261012d_role_colors_approved.sql.
-- Restores each migrated built-in role to its previous colour, but only while
-- the row still holds the colour the migration set (a colour a company chose
-- after the migration is kept).
update public.role_definitions r
set color = b.old_color
from public.role_color_backup_20261012 b
where r.id = b.role_id
  and r.color = b.new_color;
