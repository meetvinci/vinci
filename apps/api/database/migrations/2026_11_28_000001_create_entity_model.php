<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE SCHEMA IF NOT EXISTS entity;

            CREATE TABLE entity_types (
                key varchar(64) PRIMARY KEY,
                label text NOT NULL,
                plural_label text NOT NULL,
                icon text
            );

            CREATE TABLE entity_fields (
                type varchar(64) NOT NULL REFERENCES entity_types (key),
                key varchar(64) NOT NULL,
                kind varchar(16) NOT NULL,
                label text NOT NULL,
                required boolean NOT NULL DEFAULT false,
                settings jsonb NOT NULL DEFAULT '{}',
                position integer NOT NULL DEFAULT 0,
                PRIMARY KEY (type, key)
            );

            CREATE TABLE entities (
                id bigserial PRIMARY KEY,
                type varchar(64) NOT NULL REFERENCES entity_types (key),
                name text NOT NULL,
                properties jsonb NOT NULL,
                deleted_at timestamptz,
                UNIQUE (id, type)
            );
            CREATE INDEX entities_type_index ON entities (type);

            CREATE TABLE relations (
                id bigserial PRIMARY KEY,
                from_entity_id bigint NOT NULL REFERENCES entities (id),
                label varchar(64) NOT NULL,
                to_entity_id bigint NOT NULL REFERENCES entities (id),
                properties jsonb NOT NULL DEFAULT '{}',
                UNIQUE (from_entity_id, label, to_entity_id)
            );
            CREATE INDEX relations_incoming ON relations (to_entity_id, label, from_entity_id);
            SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            DROP SCHEMA entity CASCADE;
            DROP TABLE relations, entities, entity_fields, entity_types;
            SQL);
    }
};
