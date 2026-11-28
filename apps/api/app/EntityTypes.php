<?php

namespace App;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EntityTypes extends KnowledgeController
{
    public function index()
    {
        return DB::table('entity_types')->orderBy('key')->get();
    }

    public function show(string $type)
    {
        $row = $this->type($type);
        $row->fields = EntityFields::definitions($type)->values();
        return $row;
    }

    private function metadata(Request $request): array
    {
        return $request->validate([
            'label' => 'sometimes|required|string|max:255', 'plural_label' => 'sometimes|required|string|max:255',
            'icon' => 'nullable|string|max:128',
        ]);
    }

    public function store(Request $request)
    {
        $key = $request->validate(['key' => ['required', 'string', self::KEY]])['key'];
        $values = $this->metadata($request) + ['key' => $key, 'label' => $key, 'plural_label' => $key];
        abort_unless(DB::table('entity_types')->insertOrIgnore($values), 409, 'Type already exists.');
        EntityStorage::create($key);
        return response()->json($this->show($key), 201);
    }

    public function update(Request $request, string $type)
    {
        $request->validate(['key' => 'missing']);
        $values = $this->metadata($request);
        if ($values) {
            DB::table('entity_types')->where('key', $type)->update($values);
        }
        return $this->show($type);
    }

    public function destroy(string $type)
    {
        $this->type($type);
        abort_if(DB::table('entities')->where('type', $type)->exists(), 409, 'Type still has entities.');
        abort_if(DB::table('entity_fields')->where('type', '!=', $type)->where('settings->target_type', $type)->exists(),
            409, 'Another type still targets this type.');
        DB::statement('DROP TABLE '.EntityStorage::sqlTable($type));
        DB::table('entity_fields')->where('type', $type)->delete();
        DB::table('entity_types')->where('key', $type)->delete();
        return response()->noContent();
    }
}
