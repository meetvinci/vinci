<?php

use App\Records;
use App\SharedToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\Rule;

Route::middleware(SharedToken::class)->group(function () {
    $keyRules = ['required', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/D'];
    Route::get('types', fn () => DB::table('types')->orderBy('key')->get());
    Route::post('types', function (Request $request) use ($keyRules) {
        $type = $request->validate(['key' => $keyRules]);
        abort_unless(DB::table('types')->insertOrIgnore($type), 409, 'Type already exists');
        return response()->json($type, 201);
    });
    Route::prefix('types/{type}')->group(function () use ($keyRules) {
        Route::get('fields', function (string $type) {
            Records::requireType($type);
            return DB::table('fields')->where('type', $type)->orderBy('key')->get(['key', 'kind']);
        });
        Route::post('fields', function (Request $request, string $type) use ($keyRules) {
            Records::requireType($type);
            $field = $request->validate(['key' => $keyRules, 'kind' => ['required', Rule::in(['text', 'number', 'boolean'])]]);
            abort_unless(DB::table('fields')->insertOrIgnore(['type' => $type] + $field), 409, 'Field already exists');
            return response()->json($field, 201);
        });
        Route::get('records', [Records::class, 'index']);
        Route::post('records', [Records::class, 'store']);
        Route::get('records/{id}', [Records::class, 'show'])->whereNumber('id');
        Route::patch('records/{id}', [Records::class, 'update'])->whereNumber('id');
        Route::delete('records/{id}', [Records::class, 'destroy'])->whereNumber('id');
    });
});
