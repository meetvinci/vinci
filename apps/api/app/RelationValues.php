<?php

namespace App;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class RelationValues
{
    public static function ends(object $field): array
    {
        return $field->settings->direction === 'outgoing'
            ? ['from_entity_id', 'to_entity_id'] : ['to_entity_id', 'from_entity_id'];
    }

    public static function links(int $id, object $field): Builder
    {
        [$own, $other] = self::ends($field);
        return DB::table('relations as r')->join('entities as target', 'target.id', '=', "r.$other")
            ->where("r.$own", $id)->where('r.label', $field->settings->label);
    }

    public static function check(int $id, object $field): void
    {
        $links = self::links($id, $field);
        abort_if((clone $links)->where('target.type', '!=', $field->settings->target_type)->exists(),
            422, "Incorrect target type for {$field->key}.");
        $count = $links->count();
        abort_if((!$field->settings->many && $count > 1) || ($field->required && $count === 0),
            422, "Incorrect number of links for {$field->key}.");
    }

    public static function checkEntities(array $ids): void
    {
        foreach (DB::table('entities')->whereIntegerInRaw('id', array_unique($ids))->get() as $entity) {
            foreach (EntityFields::definitions($entity->type)->where('kind', 'relation') as $field) {
                self::check($entity->id, $field);
            }
        }
    }

    public static function replace(int $id, object $field, mixed $value): array
    {
        $ids = $field->settings->many ? ($value ?? []) : ($value === null ? [] : [$value]);
        abort_unless(is_array($ids) && array_is_list($ids) && collect($ids)->every(fn ($v) => is_int($v) && $v > 0)
            && count(array_unique($ids)) === count($ids), 422, "Invalid entity IDs for {$field->key}.");
        abort_unless(DB::table('entities')->whereNull('deleted_at')->where('type', $field->settings->target_type)
            ->whereIntegerInRaw('id', $ids)->count() === count($ids), 422, "Unknown target for {$field->key}.");
        [$own, $other] = self::ends($field);
        $links = DB::table('relations')->where($own, $id)->where('label', $field->settings->label);
        $removed = (clone $links)->whereIntegerNotInRaw($other, $ids);
        $previous = $removed->pluck($other)->all();
        $removed->delete();
        foreach ($ids as $target) {
            DB::table('relations')->insertOrIgnore([$own => $id, $other => $target, 'label' => $field->settings->label]);
        }
        return array_merge($previous, $ids);
    }

    public static function visible(): Builder
    {
        return DB::table('relations as r')->join('entities as f', 'f.id', '=', 'r.from_entity_id')
            ->join('entities as t', 't.id', '=', 'r.to_entity_id')->whereNull('f.deleted_at')->whereNull('t.deleted_at')->select('r.*');
    }

    public static function touching(Builder $query, int $id, ?string $direction): void
    {
        $query->where(function ($ends) use ($direction, $id) {
            if ($direction !== 'incoming') {
                $ends->where('r.from_entity_id', $id);
            }
            if ($direction !== 'outgoing') {
                $ends->orWhere('r.to_entity_id', $id);
            }
        });
    }
}
