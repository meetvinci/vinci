<?php

use App\EntityFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::statement("SELECT pg_advisory_xact_lock(hashtext('vinci-db:knowledge'))");
        // Three columns per type are reserved for identity, its type constraint and API formatting.
        $oversized = DB::table('entity_fields')->where('kind', '!=', 'relation')->groupBy('type')
            ->havingRaw('count(*) > 1597')->pluck('type');
        if ($oversized->isNotEmpty()) {
            throw new RuntimeException('Too many scalar fields for a PostgreSQL table (maximum 1597): '.$oversized->implode(', '));
        }
        DB::statement('ALTER TABLE entities ADD CONSTRAINT entities_id_type_unique UNIQUE (id, type)');
        DB::statement('CREATE SCHEMA IF NOT EXISTS entity_data');
        foreach (DB::table('entity_types')->pluck('key') as $type) {
            self::create($type);
            $table = self::table($type);
            DB::insert("INSERT INTO $table (entity_id) SELECT id FROM entities WHERE type = ?", [$type]);
            foreach (EntityFields::definitions($type)->where('kind', '!=', 'relation') as $field) {
                self::promote($field);
            }
        }
    }

    public function down(): void
    {
        DB::statement("SELECT pg_advisory_xact_lock(hashtext('vinci-db:knowledge'))");
        foreach (DB::table('entity_types')->pluck('key') as $type) {
            foreach (EntityFields::definitions($type)->where('kind', '!=', 'relation') as $field) {
                self::demote($field);
            }
            DB::statement('DROP TABLE '.self::table($type));
        }
        DB::statement('DROP SCHEMA entity_data');
        DB::statement('ALTER TABLE entities DROP CONSTRAINT entities_id_type_unique');
    }

    // Historical SQL layout used by this migration in both directions.
    // Keys are immutable. Leave room for the prefix within PostgreSQL's 63-byte identifier limit.
    private static function identifier(string $prefix, string $key): string
    {
        if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key)) {
            throw new \InvalidArgumentException('Invalid entity storage key');
        }
        return strlen($key) <= 61 ? "{$prefix}_$key" : $prefix.'h_'.substr(hash('sha256', $key), 0, 60);
    }

    private static function table(string $type): string
    {
        return 'entity_data.'.self::identifier('t', $type);
    }

    private static function column(string $key): string
    {
        return self::identifier('f', $key);
    }

    private static function create(string $type): void
    {
        $table = self::table($type);
        $primary = self::identifier('p', $type);
        DB::statement("CREATE TABLE $table (
            entity_id bigint CONSTRAINT $primary PRIMARY KEY,
            entity_type varchar(64) GENERATED ALWAYS AS ('$type'::varchar) STORED,
            api_format jsonb NOT NULL DEFAULT '{}',
            FOREIGN KEY (entity_id, entity_type) REFERENCES entities(id, type) ON DELETE CASCADE)");
    }

    // PostgreSQL timestamps lose their input spelling and a NULL column cannot distinguish omitted from explicit null.
    // api_format keeps only that wire information. A changed native timestamp always wins over a stale spelling.
    private static function jsonValue(object $field): string
    {
        $column = 'd.'.self::column($field->key);
        $format = "d.api_format -> '$field->key'";
        $value = "to_jsonb($column)";
        if ($field->kind === 'datetime') {
            $value = "CASE WHEN (d.api_format ->> '$field->key')::timestamptz = $column THEN $format ELSE $value END";
        }
        return "CASE WHEN $column IS NOT NULL THEN $value WHEN $format = 'null'::jsonb THEN 'null'::jsonb END";
    }

    private static function promote(object $field): void
    {
        $table = self::table($field->type);
        $column = self::column($field->key);
        $kind = match ($field->kind) {
            'text', 'select', 'url' => 'text', 'boolean' => 'boolean', 'number' => 'numeric',
            'date' => 'date', 'datetime' => 'timestamptz', 'multi_select' => 'text[]',
        };
        DB::statement("ALTER TABLE $table ADD COLUMN $column $kind");
        DB::statement("UPDATE $table d SET $column = v.$column,
            api_format = CASE WHEN e.properties->? = 'null'::jsonb OR ? = 'datetime'
                THEN d.api_format || jsonb_build_object(?::text, e.properties->?) ELSE d.api_format END
            FROM entities e CROSS JOIN LATERAL jsonb_populate_record(NULL::$table, jsonb_build_object('$column', e.properties->?)) v
            WHERE d.entity_id = e.id AND e.type = ? AND jsonb_exists(e.properties, ?)",
            [$field->key, $field->kind, $field->key, $field->key, $field->key, $field->type, $field->key]);
        DB::update('UPDATE entities SET properties = properties - ?::text WHERE type = ? AND jsonb_exists(properties, ?)',
            [$field->key, $field->type, $field->key]);
        if ($field->required) {
            DB::statement("ALTER TABLE $table ALTER COLUMN $column SET NOT NULL");
        }
    }

    private static function demote(object $field): void
    {
        $table = self::table($field->type);
        $value = self::jsonValue($field);
        DB::update("UPDATE entities e SET properties = e.properties || jsonb_build_object(?::text, $value)
            FROM $table d WHERE e.id = d.entity_id AND ($value) IS NOT NULL", [$field->key]);
    }
};
