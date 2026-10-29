-- Notes may live directly in the workspace. Existing rows keep their folder.
ALTER TABLE notes ALTER COLUMN folder_id DROP NOT NULL;
CREATE UNIQUE INDEX notes_root_order ON notes(sort_order) WHERE folder_id IS NULL;
-- A folder deletion is one atomic DB operation including every descendant.
ALTER TABLE notes DROP CONSTRAINT notes_folder_fk;
ALTER TABLE notes ADD CONSTRAINT notes_folder_fk FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE;
ALTER TABLE folders DROP CONSTRAINT folders_parent_id_fkey;
ALTER TABLE folders ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE;
