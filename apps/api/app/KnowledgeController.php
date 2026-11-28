<?php

namespace App;

use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

abstract class KnowledgeController extends Controller
{
    public const KEY = 'regex:/^[a-z][a-z0-9_]{0,63}$/D';

    public function callAction($method, $parameters)
    {
        foreach (['entity', 'relation'] as $parameter) {
            $id = request()->route($parameter);
            abort_if($id !== null && strlen($id) === 19 && strcmp($id, (string) PHP_INT_MAX) > 0, 404);
        }

        return DB::transaction(function () use ($method, $parameters) {
            if (in_array($method, ['index', 'show', 'query'], true)) {
                // Read metadata and its physical columns under the same schema version.
                DB::statement("SELECT pg_advisory_xact_lock_shared(hashtext('vinci-db:knowledge'))");
            } else {
                // Schema edits, field patches and direct links share cross-table invariants.
                DB::statement("SELECT pg_advisory_xact_lock(hashtext('vinci-db:knowledge'))");
            }

            return parent::callAction($method, $parameters);
        });
    }

    protected function objectInput(\Illuminate\Http\Request $request, string $key): object
    {
        // Decode objects as objects, preserving empty objects and numeric keys inside free-form JSON.
        $body = json_decode($request->getContent());
        if (!is_object($body) || !property_exists($body, $key)) {
            abort_if($request->has($key), 422, "Send $key in a JSON object.");
            return (object) [];
        }
        abort_unless(is_object($body->$key), 422, "$key must be an object.");
        return $body->$key;
    }

    protected function type(string $key): object
    {
        return DB::table('entity_types')->where('key', $key)->firstOrFail();
    }
}
