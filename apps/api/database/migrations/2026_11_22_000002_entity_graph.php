<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            ALTER TABLE types RENAME TO entity_types;
            ALTER TABLE fields RENAME TO entity_fields;
            ALTER TABLE records RENAME TO entities;
            ALTER TABLE entity_types ADD label text, ADD plural_label text, ADD icon text;
            UPDATE entity_types SET label = key, plural_label = key;
            ALTER TABLE entity_types ALTER label SET NOT NULL, ALTER plural_label SET NOT NULL;
            ALTER TABLE entity_fields ADD label text, ADD required boolean NOT NULL DEFAULT false,
                ADD settings jsonb NOT NULL DEFAULT '{}', ADD position integer NOT NULL DEFAULT 0;
            WITH ordered AS (
                SELECT type, key, row_number() OVER (PARTITION BY type ORDER BY key) AS pos FROM entity_fields
            )
            UPDATE entity_fields f SET label = f.key, position = ordered.pos
                FROM ordered WHERE (f.type, f.key) = (ordered.type, ordered.key);
            ALTER TABLE entity_fields ALTER label SET NOT NULL;
            ALTER TABLE entities ADD name text, ADD deleted_at timestamptz;
            UPDATE entities SET name = coalesce(nullif(properties->>'name', ''), type || ' #' || id);
            ALTER TABLE entities ALTER name SET NOT NULL;
            CREATE TABLE relations (
                id bigserial PRIMARY KEY, from_entity_id bigint NOT NULL REFERENCES entities,
                label varchar(64) NOT NULL, to_entity_id bigint NOT NULL REFERENCES entities,
                properties jsonb NOT NULL DEFAULT '{}', UNIQUE (from_entity_id, label, to_entity_id)
            );
            CREATE INDEX relations_incoming ON relations (to_entity_id, label, from_entity_id);
            SQL);
    }

    public function down(): void
    {
        throw new RuntimeException('Restoring the records-only schema requires a pre-upgrade backup.');
    }
};
