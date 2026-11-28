<?php

namespace App;

use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EntityStorage
{
    // Keys are immutable. Leave room for the prefix within PostgreSQL's 63-byte identifier limit.
    private static function identifier(string $prefix, string $key): string
    {
        if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key)) {
            throw new \InvalidArgumentException('Invalid entity storage key');
        }
        return strlen($key) <= 61 ? "{$prefix}_$key" : $prefix.'h_'.substr(hash('sha256', $key), 0, 60);
    }

    public static function table(string $type): string
    {
        return 'entity_data.'.self::identifier('t', $type);
    }

    public static function column(string $key): string
    {
        return self::identifier('f', $key);
    }

    public static function create(string $type): void
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

    public static function rows(string $type, Collection $fields): Builder
    {
        $query = DB::table('entities as e')->join(self::table($type).' as d', 'd.entity_id', '=', 'e.id')
            ->where('e.type', $type)->select('e.id', 'e.type', 'e.name', 'e.deleted_at');
        $pairs = [];
        foreach ($fields->where('kind', '!=', 'relation') as $field) {
            $pairs[] = "('$field->key', ".self::jsonValue($field).')';
        }
        if (!$pairs) {
            return $query->addSelect('e.properties');
        }
        // Filtering SQL NULL here retains explicit JSON null and omits absent fields.
        $values = implode(', ', $pairs);
        return $query->selectRaw("e.properties || COALESCE((SELECT jsonb_object_agg(k, v)
            FROM (VALUES $values) AS p(k, v) WHERE v IS NOT NULL), '{}'::jsonb) AS properties");
    }

    public static function filter(Builder $query, object $field, mixed $value): void
    {
        $column = 'd.'.self::column($field->key);
        $native = match ($field->kind) {
            'text', 'url', 'select' => is_string($value),
            'boolean' => is_bool($value),
            'number' => is_float($value) || is_int($value),
            default => false,
        };
        if ($native) {
            $parameter = $field->kind === 'number' ? json_encode($value, JSON_THROW_ON_ERROR) : $value;
            $query->where($column, '=', $parameter);
        } else {
            // Preserve exact JSON semantics for dates with offsets, missing values, and heterogeneous inputs.
            $query->whereRaw('('.self::jsonValue($field).') = ?::jsonb', [json_encode($value, JSON_THROW_ON_ERROR)]);
        }
    }

    public static function sort(Builder $query, object $field, string $order): void
    {
        $column = 'd.'.self::column($field->key);
        if ($field->kind === 'multi_select') {
            // The API compares JSON arrays by length first, unlike SQL arrays.
            $query->orderByRaw('('.self::jsonValue($field).") $order NULLS LAST");
        } elseif ($field->kind === 'datetime' || $field->required) {
            $query->orderByRaw("$column $order NULLS LAST");
        } else {
            // A JSON null precedes scalar values in ascending order. Missing keys sort last in either direction.
            $explicitNull = "($column IS NULL AND jsonb_exists(d.api_format, '$field->key'))";
            if ($order === 'asc') {
                $query->orderByRaw("$explicitNull DESC");
            }
            $query->orderByRaw("$column $order NULLS LAST");
            if ($order === 'desc') {
                $query->orderByRaw("$explicitNull DESC");
            }
        }
    }

    public static function promote(object $field): void
    {
        $table = self::table($field->type);
        $column = self::column($field->key);
        $kind = match ($field->kind) {
            'text', 'select', 'url' => 'text', 'boolean' => 'boolean', 'number' => 'numeric',
            'date' => 'date', 'datetime' => 'timestamptz', 'multi_select' => 'text[]',
        };
        try {
            DB::statement("ALTER TABLE $table ADD COLUMN $column $kind");
        } catch (QueryException $error) {
            if ($error->getCode() === '54011') {
                abort(422, "PostgreSQL has no remaining column slots for type {$field->type}. Dropped columns also consume slots.");
            }
            throw $error;
        }
        DB::statement("UPDATE $table d SET $column = v.$column,
            api_format = CASE WHEN e.properties->? = 'null'::jsonb OR ? = 'datetime'
                THEN d.api_format || jsonb_build_object(?::text, e.properties->?) ELSE d.api_format END
            FROM entities e CROSS JOIN LATERAL jsonb_populate_record(NULL::$table, jsonb_build_object('$column', e.properties->?)) v
            WHERE d.entity_id = e.id AND e.type = ? AND jsonb_exists(e.properties, ?)",
            [$field->key, $field->kind, $field->key, $field->key, $field->key, $field->type, $field->key]);
        DB::update('UPDATE entities SET properties = properties - ?::text WHERE type = ? AND jsonb_exists(properties, ?)',
            [$field->key, $field->type, $field->key]);
    }

    public static function required(object $field): void
    {
        $table = self::table($field->type);
        $column = self::column($field->key);
        $action = $field->required ? 'SET' : 'DROP';
        DB::statement("ALTER TABLE $table ALTER COLUMN $column $action NOT NULL");
    }

    public static function demote(object $field): void
    {
        $table = self::table($field->type);
        $column = self::column($field->key);
        $value = self::jsonValue($field);
        DB::update("UPDATE entities e SET properties = e.properties || jsonb_build_object(?::text, $value)
            FROM $table d WHERE e.id = d.entity_id AND ($value) IS NOT NULL", [$field->key]);
        DB::update("UPDATE $table SET api_format = api_format - ?::text WHERE jsonb_exists(api_format, ?)", [$field->key, $field->key]);
        DB::statement("ALTER TABLE $table DROP COLUMN $column");
    }

    public static function write(string $type, int $id, Collection $fields, object $patch, bool $create): void
    {
        $table = self::table($type);
        $values = [];
        $format = [];
        $keys = [];
        foreach ($fields->where('kind', '!=', 'relation') as $field) {
            if (!$create && !property_exists($patch, $field->key)) {
                continue;
            }
            $value = $patch->{$field->key} ?? null;
            EntityFields::checkValue($field, $value);
            if (property_exists($patch, $field->key)) {
                $values[self::column($field->key)] = $value;
                $keys[] = $field->key;
                if ($value === null || $field->kind === 'datetime') {
                    $format[$field->key] = $value;
                }
                unset($patch->{$field->key});
            }
        }
        $columns = array_keys($values);
        $values['api_format'] = (object) $format;
        $json = json_encode($values, JSON_THROW_ON_ERROR);
        $source = "jsonb_populate_record(NULL::$table, ?::jsonb) v";
        if ($create) {
            $names = implode(', ', [...$columns, 'api_format']);
            DB::insert("INSERT INTO $table (entity_id, $names) SELECT ?, $names FROM $source", [$id, $json]);
        } elseif ($columns) {
            $assign = array_map(fn ($col) => "$col = v.$col", $columns);
            $assign[] = 'api_format = (d.api_format - ARRAY(SELECT jsonb_array_elements_text(?::jsonb))) || v.api_format';
            DB::update("UPDATE $table d SET ".implode(', ', $assign)." FROM $source WHERE d.entity_id = ?",
                [json_encode($keys, JSON_THROW_ON_ERROR), $json, $id]);
        }
    }
}
