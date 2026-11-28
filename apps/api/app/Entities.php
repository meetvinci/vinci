<?php

namespace App;

use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Entities extends KnowledgeController
{
    private function present(Collection $rows): Collection
    {
        foreach ($rows->groupBy('type') as $type => $entities) {
            $fields = EntityFields::definitions($type);
            $ids = $entities->pluck('id')->all();
            $stored = EntityStorage::rows($type, $fields)->whereIntegerInRaw('e.id', $ids)->get()->keyBy('id');
            foreach ($entities as $entity) {
                $entity->properties = json_decode($stored[$entity->id]->properties);
                $entity->related = (object) [];
            }
            foreach ($fields->where('kind', 'relation') as $field) {
                [$own, $other] = RelationValues::ends($field);
                $links = RelationValues::visible()->whereIntegerInRaw("r.$own", $ids)->where('r.label', $field->settings->label)
                    ->orderBy("r.$other")->get()->groupBy($own);
                foreach ($entities as $entity) {
                    $targets = $links->get($entity->id, collect())->pluck($other);
                    $entity->related->{$field->key} = $field->settings->many ? $targets->all() : $targets->first();
                }
            }
        }
        return $rows;
    }

    public function show(string $entity)
    {
        $row = DB::table('entities')->where('id', $entity)->whereNull('deleted_at')->firstOrFail();
        return $this->present(collect([$row]))->first();
    }

    public function index(Request $request)
    {
        return $this->query($request);
    }

    public function query(Request $request)
    {
        $data = $request->validate([
            'type' => ['sometimes', self::KEY], 'page' => 'sometimes|integer|min:1',
            'sort' => ['sometimes', self::KEY], 'order' => 'sometimes|in:asc,desc',
            'related' => 'sometimes|required|array:entity_id,label,direction', 'related.entity_id' => 'required_with:related|integer|min:1',
            'related.label' => ['sometimes', self::KEY], 'related.direction' => 'sometimes|in:incoming,outgoing',
        ]);
        $sort = $data['sort'] ?? 'id';
        $filter = $this->objectInput($request, 'properties');
        $systemSort = in_array($sort, ['id', 'name'], true);
        $query = DB::table('entities as e')->select('e.*');
        $sortField = null;
        if (isset($data['type'])) {
            $type = $data['type'];
            $this->type($type);
            $query->where('e.type', $type);
            $fields = EntityFields::definitions($type);
            $query->join(EntityStorage::table($type).' as d', 'd.entity_id', '=', 'e.id');
            foreach ($filter as $key => $value) {
                $field = $fields->get($key);
                if (!$field || $field->kind === 'relation') {
                    $query->whereRaw('(e.properties -> ?::text) = ?::jsonb', [$key, json_encode($value, JSON_THROW_ON_ERROR)]);
                } else {
                    EntityStorage::filter($query, $field, $value);
                }
            }
            $sortField = $fields->get($sort);
        } elseif ((array) $filter || !$systemSort) {
            // A field key may have different kinds, or be an extra, across types.
            $branches = null;
            $keys = [...array_keys((array) $filter), $sort];
            foreach (DB::table('entity_types')->pluck('key') as $type) {
                $rows = EntityStorage::rows($type, EntityFields::definitions($type)->only($keys));
                $branches = $branches ? $branches->unionAll($rows) : $rows;
            }
            if ($branches) {
                $query = DB::query()->fromSub($branches, 'e');
            }
            foreach ($filter as $key => $value) {
                $query->whereRaw('(e.properties -> ?::text) = ?::jsonb', [$key, json_encode($value, JSON_THROW_ON_ERROR)]);
            }
        }
        $query->whereNull('e.deleted_at');
        if (isset($data['related'])) {
            $related = $data['related'];
            $links = RelationValues::visible();
            if (isset($related['label'])) {
                $links->where('r.label', $related['label']);
            }
            $links->where(function ($pairs) use ($related) {
                foreach (['outgoing' => ['from_entity_id', 'to_entity_id'], 'incoming' => ['to_entity_id', 'from_entity_id']] as $direction => [$own, $other]) {
                    if (!isset($related['direction']) || $related['direction'] === $direction) {
                        $pairs->orWhere(fn ($pair) => $pair->whereColumn("r.$own", 'e.id')->where("r.$other", $related['entity_id']));
                    }
                }
            });
            $query->whereExists($links);
        }
        $order = $data['order'] ?? 'asc';
        if ($systemSort) {
            $query->orderBy("e.$sort", $order);
        } elseif ($sortField && $sortField->kind !== 'relation') {
            EntityStorage::sort($query, $sortField, $order);
        } else {
            $query->orderByRaw("(e.properties -> ?::text) $order NULLS LAST", [$sort]);
        }
        $page = $query->orderBy('e.id')->simplePaginate(50)->withQueryString();
        return [
            'data' => $this->present($page->getCollection()),
            'page' => $page->currentPage(),
            'next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null,
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate(['type' => ['required', self::KEY], 'name' => 'required|string|max:255']);
        $this->type($data['type']);
        $id = DB::table('entities')->insertGetId($data + ['properties' => '{}']);
        return response()->json($this->patch($request, $id, true), 201);
    }

    public function update(Request $request, string $entity)
    {
        $request->validate(['type' => 'missing']);
        return $this->patch($request, $entity);
    }

    private function patch(Request $request, int $id, bool $create = false)
    {
        $row = DB::table('entities')->where('id', $id)->whereNull('deleted_at')->firstOrFail();
        $data = $request->validate(['name' => 'sometimes|required|string|max:255']);
        $fields = EntityFields::definitions($row->type);
        $patch = $this->objectInput($request, 'properties');
        EntityStorage::write($row->type, $id, $fields, $patch, $create);
        foreach ($patch as $key => $value) {
            abort_if($fields->get($key)?->kind === 'relation', 422, "Set $key through related.");
        }
        if ((array) $patch) {
            DB::update('UPDATE entities SET properties = properties || ?::jsonb WHERE id = ?', [json_encode($patch, JSON_THROW_ON_ERROR), $id]);
        }
        if ($data) {
            DB::table('entities')->where('id', $id)->update($data);
        }
        $affected = [$id];
        foreach ($this->objectInput($request, 'related') as $key => $value) {
            $field = $fields->get($key);
            abort_unless($field?->kind === 'relation', 422, "Unknown relation field $key.");
            $affected = array_merge($affected, RelationValues::replace($id, $field, $value));
        }
        RelationValues::checkEntities($affected);
        return $this->show($id);
    }

    public function destroy(string $entity)
    {
        abort_unless(DB::table('entities')->where('id', $entity)->whereNull('deleted_at')->update(['deleted_at' => now()]), 404);
        return response()->noContent();
    }

    public function restore(string $entity)
    {
        abort_unless(DB::table('entities')->where('id', $entity)->update(['deleted_at' => null]), 404);
        return $this->show($entity);
    }
}
