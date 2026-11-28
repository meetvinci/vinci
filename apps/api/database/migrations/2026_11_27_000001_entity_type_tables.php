<?php

use App\EntityFields;
use App\EntityStorage;
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
            EntityStorage::create($type);
            $table = EntityStorage::table($type);
            DB::insert("INSERT INTO $table (entity_id) SELECT id FROM entities WHERE type = ?", [$type]);
            foreach (EntityFields::definitions($type)->where('kind', '!=', 'relation') as $field) {
                EntityStorage::promote($field);
                if ($field->required) {
                    EntityStorage::required($field);
                }
            }
        }
    }

    public function down(): void
    {
        DB::statement("SELECT pg_advisory_xact_lock(hashtext('vinci-db:knowledge'))");
        foreach (DB::table('entity_types')->pluck('key') as $type) {
            foreach (EntityFields::definitions($type)->where('kind', '!=', 'relation') as $field) {
                EntityStorage::demote($field);
            }
            DB::statement('DROP TABLE '.EntityStorage::table($type));
        }
        DB::statement('DROP SCHEMA entity_data');
        DB::statement('ALTER TABLE entities DROP CONSTRAINT entities_id_type_unique');
    }
};
