<?php

namespace App;

use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class EntityFields extends KnowledgeController
{
    public static function definitions(string $type): Collection
    {
        return DB::table('entity_fields')->where('type', $type)->orderBy('position')->orderBy('key')->get()
            ->each(function ($field) { $field->settings = json_decode($field->settings); })->keyBy('key');
    }

    public function store(Request $request, string $type)
    {
        $this->type($type);
        $data = $request->validate([
            'key' => ['required', 'string', self::KEY],
            'kind' => ['required', Rule::in(['text', 'boolean', 'number', 'url', 'date', 'datetime', 'select', 'multi_select', 'relation'])],
        ]);
        $fields = self::definitions($type);
        abort_if($fields->has($data['key']), 409, 'Field already exists.');
        $field = (object) ($data + ['type' => $type, 'label' => $data['key'], 'required' => false,
            'settings' => (object) [], 'position' => 1 + ($fields->max('position') ?? 0)]);
        return response()->json($this->save($request, $field, true), 201);
    }

    public function update(Request $request, string $type, string $field)
    {
        $request->validate(['key' => 'missing', 'kind' => 'missing']);
        $definition = self::definitions($type)->get($field);
        abort_unless($definition, 404);
        return $this->save($request, $definition);
    }

    private function save(Request $request, object $field, bool $create = false)
    {
        $rules = ['label' => 'sometimes|required|string|max:255', 'required' => 'sometimes|boolean:strict'];
        $rules += match ($field->kind) {
            'relation' => ['settings' => 'sometimes|required|array:label,direction,target_type,many',
                'settings.label' => ['required_with:settings', self::KEY], 'settings.direction' => 'required_with:settings|in:incoming,outgoing',
                'settings.target_type' => 'required_with:settings|string|exists:entity_types,key', 'settings.many' => 'required_with:settings|boolean:strict'],
            'select', 'multi_select' => ['settings' => 'sometimes|required|array:options', 'settings.options' => 'present_with:settings|list',
                'settings.options.*' => 'array:value,label,color', 'settings.options.*.value' => 'required|string|distinct:strict',
                'settings.options.*.label' => 'required|string', 'settings.options.*.color' => 'sometimes|string'],
            default => ['settings' => 'missing'],
        };
        $data = $request->validate($rules);
        $field->label = $data['label'] ?? $field->label;
        $wasRequired = $field->required;
        $field->required = $data['required'] ?? $field->required;
        $field->settings = (object) ($data['settings'] ?? $field->settings);
        if ($field->kind === 'relation') {
            abort_unless(isset($field->settings->label), 422, 'Relation settings are required.');
            // One definition per direction and label keeps the meaning of a direct write unambiguous.
            abort_if(DB::table('entity_fields')->where('type', $field->type)->where('key', '!=', $field->key)
                ->where('settings->label', $field->settings->label)->where('settings->direction', $field->settings->direction)->exists(),
                409, 'This direction and relation label already have a field.');
        } elseif (in_array($field->kind, ['select', 'multi_select'], true)) {
            $field->settings->options ??= [];
        }

        // Redefining a removed field must account for retained properties and links, including archived entities.
        $columns = !$create && $field->kind !== 'relation' ? collect([$field]) : collect();
        $rows = DB::query()->fromSub(EntityStorage::rows($field->type, $columns), 'records');
        foreach ($rows->lazyById() as $entity) {
            $properties = json_decode($entity->properties);
            if ($field->kind === 'relation') {
                abort_if(property_exists($properties, $field->key), 409, 'An entity stores a property with this key.');
                RelationValues::check($entity->id, $field);
            } else {
                self::checkValue($field, $properties->{$field->key} ?? null);
            }
        }
        if ($field->kind !== 'relation') {
            if ($create) {
                EntityStorage::promote($field);
            }
            if ($field->required !== $wasRequired || ($create && $field->required)) {
                EntityStorage::required($field);
            }
        }
        DB::table('entity_fields')->updateOrInsert(['type' => $field->type, 'key' => $field->key],
            ['label' => $field->label, 'required' => $field->required, 'kind' => $field->kind,
                'settings' => json_encode($field->settings, JSON_THROW_ON_ERROR), 'position' => $field->position]);
        return $field;
    }

    public static function checkValue(object $field, mixed $value): void
    {
        $options = array_column($field->settings->options ?? [], 'value');
        abort_if($field->required && ($value === '' || $value === []), 422, "A value is required for {$field->key}.");
        $valid = $value === null ? !$field->required : match ($field->kind) {
            'text' => is_string($value),
            'boolean' => is_bool($value),
            'number' => is_int($value) || is_float($value),
            'url' => is_string($value) && filter_var($value, FILTER_VALIDATE_URL) && in_array(parse_url($value, PHP_URL_SCHEME), ['http', 'https'], true),
            'date' => is_string($value) && preg_match('/^(\d{4})-(\d\d)-(\d\d)$/D', $value, $parts) && checkdate($parts[2], $parts[3], $parts[1]),
            'datetime' => is_string($value) && preg_match('/^(?!0000)\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/D', $value)
                && date_parse($value)['error_count'] === 0 && date_parse($value)['warning_count'] === 0,
            'select' => in_array($value, $options, true),
            'multi_select' => is_array($value) && array_is_list($value) && collect($value)->every(fn ($v) => in_array($v, $options, true))
                && count(array_unique($value)) === count($value),
            default => false,
        };
        abort_unless($valid, 422, "Invalid value for field {$field->key}.");
    }

    public function reorder(Request $request, string $type)
    {
        $this->type($type);
        $keys = $request->validate(['keys' => 'present|array|list', 'keys.*' => 'required|string|distinct:strict'])['keys'];
        $fields = self::definitions($type);
        abort_unless(count($keys) === $fields->count() && !array_diff($keys, $fields->keys()->all()), 422, 'Supply every field key once.');
        foreach ($keys as $index => $key) {
            DB::table('entity_fields')->where(['type' => $type, 'key' => $key])->update(['position' => $index + 1]);
        }
        return self::definitions($type)->values();
    }

    public function destroy(string $type, string $field)
    {
        $definition = self::definitions($type)->get($field);
        abort_unless($definition, 404);
        if ($definition->kind !== 'relation') {
            EntityStorage::demote($definition);
        }
        DB::table('entity_fields')->where(['type' => $type, 'key' => $field])->delete();
        return response()->noContent();
    }
}
