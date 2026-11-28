<?php

namespace App;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Relations extends KnowledgeController
{
    private function present(object $relation): object
    {
        $relation->properties = json_decode($relation->properties);
        return $relation;
    }

    public function index(Request $request)
    {
        $data = $request->validate(['entity_id' => 'required_with:direction|integer|min:1',
            'direction' => 'sometimes|in:incoming,outgoing', 'label' => ['sometimes', self::KEY], 'page' => 'sometimes|integer|min:1']);
        $links = RelationValues::visible();
        if (isset($data['entity_id'])) {
            RelationValues::touching($links, $data['entity_id'], $data['direction'] ?? null);
        }
        if (isset($data['label'])) {
            $links->where('r.label', $data['label']);
        }
        return $links->orderBy('r.id')->simplePaginate(50)->through($this->present(...))->withQueryString();
    }

    public function show(string $relation)
    {
        return $this->present(RelationValues::visible()->where('r.id', $relation)->firstOrFail());
    }

    public function store(Request $request)
    {
        $data = $request->validate(['from_entity_id' => 'required|integer|min:1', 'label' => ['required', self::KEY],
            'to_entity_id' => 'required|integer|min:1']);
        $ends = array_unique([$data['from_entity_id'], $data['to_entity_id']]);
        abort_unless(DB::table('entities')->whereNull('deleted_at')->whereIntegerInRaw('id', $ends)->count() === count($ends),
            422, 'Both endpoints must be active entities.');
        $existing = DB::table('relations')->where($data)->first();
        $id = $existing->id ?? DB::table('relations')->insertGetId($data);
        $this->patchProperties($request, $id);
        RelationValues::checkEntities($ends);
        return response()->json($this->show($id), $existing ? 200 : 201);
    }

    private function patchProperties(Request $request, int $id): void
    {
        $patch = $this->objectInput($request, 'properties');
        if (!(array) $patch) {
            return;
        }
        DB::update('UPDATE relations SET properties = properties || ?::jsonb WHERE id = ?', [json_encode($patch, JSON_THROW_ON_ERROR), $id]);
    }

    public function update(Request $request, string $relation)
    {
        $request->validate(['from_entity_id' => 'missing', 'to_entity_id' => 'missing', 'label' => 'missing']);
        $this->show($relation);
        $this->patchProperties($request, $relation);
        return $this->show($relation);
    }

    public function destroy(string $relation)
    {
        $row = $this->show($relation);
        DB::table('relations')->where('id', $relation)->delete();
        RelationValues::checkEntities([$row->from_entity_id, $row->to_entity_id]);
        return response()->noContent();
    }
}
