CREATE TABLE folders (
    id UUID PRIMARY KEY,
    parent_id UUID REFERENCES folders(id),
    name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
    sort_order BIGINT NOT NULL CHECK (sort_order >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT folders_not_own_parent CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX folders_sibling_order ON folders(parent_id, sort_order) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX folders_root_order ON folders(sort_order) WHERE parent_id IS NULL;

ALTER TABLE notes ADD COLUMN folder_id UUID;
ALTER TABLE notes ADD COLUMN sort_order BIGINT;
ALTER TABLE notes ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

-- A new, collision-free ID is allocated only in the new folders table.
INSERT INTO folders (id, name, sort_order, created_at, updated_at)
SELECT 'b6a83967-7c21-4cd6-9056-c017854e247b', '내 원고', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM notes);

UPDATE notes SET folder_id = 'b6a83967-7c21-4cd6-9056-c017854e247b';
WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS position FROM notes
)
UPDATE notes SET sort_order = ordered.position FROM ordered WHERE notes.id = ordered.id;

ALTER TABLE notes ADD CONSTRAINT notes_folder_fk FOREIGN KEY (folder_id) REFERENCES folders(id);
ALTER TABLE notes ALTER COLUMN folder_id SET NOT NULL;
ALTER TABLE notes ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE notes ADD CONSTRAINT notes_nonnegative_order CHECK (sort_order >= 0);
CREATE UNIQUE INDEX notes_folder_order ON notes(folder_id, sort_order);
