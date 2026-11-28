<?php

use App\EntityStorage;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $this->renameStorage(true);
    }

    public function down(): void
    {
        $this->renameStorage(false);
    }

    private function oldName(string $prefix, string $key): string
    {
        return strlen($key) <= 61 ? "{$prefix}_$key" : $prefix.'h_'.substr(hash('sha256', $key), 0, 60);
    }

    private function renameStorage(bool $forward): void
    {
        DB::statement("SELECT pg_advisory_xact_lock(hashtext('vinci-db:knowledge'))");
        [$source, $target] = $forward ? ['entity_data', 'entity'] : ['entity', 'entity_data'];
        DB::statement("CREATE SCHEMA IF NOT EXISTS $target");
        foreach (DB::table('entity_types')->pluck('key') as $type) {
            $names = fn ($old, $new) => $forward ? [$old, $new] : [$new, $old];
            [$from, $to] = $names($this->oldName('t', $type), substr(EntityStorage::table($type), strlen('entity.')));
            [$oldPk, $newPk] = $names($this->oldName('p', $type), '_pk_'.substr(hash('sha256', $type), 0, 58));
            // A legal key can equal another table, index or field's old name. Stage the names before moving them.
            DB::statement("ALTER TABLE $source.\"$from\" RENAME TO __moving");
            DB::statement("ALTER TABLE $source.__moving RENAME CONSTRAINT \"$oldPk\" TO __moving_pk");
            $fields = DB::table('entity_fields')->where('type', $type)->where('kind', '!=', 'relation')->pluck('key');
            foreach ($fields as $i => $key) {
                [$old] = $names($this->oldName('f', $key), EntityStorage::column($key));
                DB::statement("ALTER TABLE $source.__moving RENAME COLUMN \"$old\" TO __moving_$i");
            }
            foreach ($fields as $i => $key) {
                [, $new] = $names($this->oldName('f', $key), EntityStorage::column($key));
                DB::statement("ALTER TABLE $source.__moving RENAME COLUMN __moving_$i TO \"$new\"");
            }
            DB::statement("ALTER TABLE $source.__moving SET SCHEMA $target");
            DB::statement("ALTER TABLE $target.__moving RENAME CONSTRAINT __moving_pk TO \"$newPk\"");
            DB::statement("ALTER TABLE $target.__moving RENAME TO \"$to\"");
        }
        DB::statement("DROP SCHEMA $source");
    }
};
