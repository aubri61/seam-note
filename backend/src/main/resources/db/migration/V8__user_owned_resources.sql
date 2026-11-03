-- Preserve unowned data under a disabled archival identity. Never assign it to the first signup.
INSERT INTO app_users(id,email_normalized,nickname,enabled,created_at)
VALUES ('00000000-0000-4000-8000-000000000000','legacy-archive@migration.invalid','기존 데이터 보관',false,CURRENT_TIMESTAMP);

ALTER TABLE folders ADD COLUMN owner_id uuid REFERENCES app_users(id);
ALTER TABLE notes ADD COLUMN owner_id uuid REFERENCES app_users(id);
UPDATE folders SET owner_id='00000000-0000-4000-8000-000000000000';
UPDATE notes SET owner_id='00000000-0000-4000-8000-000000000000';
ALTER TABLE folders ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE notes ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE folders ADD CONSTRAINT folders_owner_id_unique UNIQUE(owner_id,id);
ALTER TABLE folders DROP CONSTRAINT folders_parent_id_fkey;
ALTER TABLE folders ADD CONSTRAINT folders_owner_parent_fk FOREIGN KEY(owner_id,parent_id) REFERENCES folders(owner_id,id) ON DELETE CASCADE;
ALTER TABLE notes DROP CONSTRAINT notes_folder_fk;
ALTER TABLE notes ADD CONSTRAINT notes_owner_folder_fk FOREIGN KEY(owner_id,folder_id) REFERENCES folders(owner_id,id) ON DELETE CASCADE;
DROP INDEX folders_sibling_order;
DROP INDEX folders_root_order;
DROP INDEX notes_folder_order;
DROP INDEX notes_root_order;
CREATE UNIQUE INDEX folders_sibling_order ON folders(owner_id,parent_id,sort_order) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX folders_root_order ON folders(owner_id,sort_order) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX notes_folder_order ON notes(owner_id,folder_id,sort_order) WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX notes_root_order ON notes(owner_id,sort_order) WHERE folder_id IS NULL;
-- Same-owner parent/folder lookup and cascade probes.
CREATE INDEX folders_owner_parent ON folders(owner_id,parent_id);
CREATE INDEX notes_owner_folder ON notes(owner_id,folder_id);

ALTER TABLE creation_operations ADD COLUMN owner_id uuid REFERENCES app_users(id);
ALTER TABLE note_update_operations ADD COLUMN owner_id uuid REFERENCES app_users(id);
UPDATE creation_operations SET owner_id='00000000-0000-4000-8000-000000000000';
UPDATE note_update_operations SET owner_id='00000000-0000-4000-8000-000000000000';
ALTER TABLE creation_operations ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE note_update_operations ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE creation_operations DROP CONSTRAINT creation_operations_pkey;
ALTER TABLE note_update_operations DROP CONSTRAINT note_update_operations_pkey;
ALTER TABLE creation_operations ADD PRIMARY KEY(owner_id,operation_id);
ALTER TABLE note_update_operations ADD PRIMARY KEY(owner_id,operation_id);
