<?php

namespace App;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class Records
{
    public static function requireType(string $type): void
    {
        abort_unless(DB::table('types')->where('key', $type)->exists(), 404);
    }

    private function properties(Request $request, string $type): array
    {
        $properties = $request->validate(['properties' => ['present', 'array']])['properties'];
        $fields = DB::table('fields')->where('type', $type)->pluck('kind', 'key');
        foreach ($properties as $key => $value) {
            $valid = match ($fields->get($key)) {
                'text' => is_string($value),
                'number' => is_int($value) || is_float($value),
                'boolean' => is_bool($value),
                default => false,
            };
            if (!$valid) {
                throw ValidationException::withMessages(["properties.$key" => 'Unknown field or incorrect JSON value type.']);
            }
        }
        return $properties;
    }

    private function decode(object $record): object
    {
        $record->properties = json_decode($record->properties, flags: JSON_THROW_ON_ERROR);
        return $record;
    }

    public function index(Request $request, string $type)
    {
        self::requireType($type);
        $request->validate(['page' => 'sometimes|integer|min:1', 'field' => 'required_with:value|string', 'value' => 'required_with:field|string']);
        $query = DB::table('records')->where('type', $type);
        if ($request->has('field')) {
            $query->whereRaw('properties ->> ? = ?', [$request->input('field'), $request->input('value')]);
        }
        return $query->orderBy('id')->simplePaginate(50)->withQueryString()->through($this->decode(...));
    }

    public function store(Request $request, string $type)
    {
        self::requireType($type);
        $properties = $this->properties($request, $type);
        $id = DB::table('records')->insertGetId(['type' => $type, 'properties' => json_encode((object) $properties, JSON_THROW_ON_ERROR)]);
        return response()->json(['id' => $id, 'type' => $type, 'properties' => (object) $properties], 201);
    }

    public function show(string $type, string $id)
    {
        $record = DB::table('records')->where(['type' => $type, 'id' => $id])->firstOrFail();
        return response()->json($this->decode($record));
    }

    public function update(Request $request, string $type, string $id)
    {
        $properties = $this->properties($request, $type);
        $record = DB::selectOne('UPDATE records SET properties = properties || ?::jsonb WHERE type = ? AND id = ? RETURNING *',
            [json_encode((object) $properties, JSON_THROW_ON_ERROR), $type, $id]);
        abort_unless($record, 404);
        return response()->json($this->decode($record));
    }

    public function destroy(string $type, string $id)
    {
        abort_unless(DB::table('records')->where(['type' => $type, 'id' => $id])->delete(), 404);
        return response()->noContent();
    }
}
