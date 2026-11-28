<?php

use App\Entities;
use App\EntityFields;
use App\EntityTypes;
use App\Relations;
use App\SharedToken;
use Illuminate\Support\Facades\Route;

Route::middleware(SharedToken::class)->group(function () {
    Route::apiResource('entity-types', EntityTypes::class)->parameters(['entity-types' => 'type']);
    Route::prefix('entity-types/{type}/fields')->controller(EntityFields::class)->group(function () {
        Route::post('/', 'store');
        Route::put('order', 'reorder');
        Route::patch('{field}', 'update');
        Route::delete('{field}', 'destroy');
    });
    Route::post('entities/query', [Entities::class, 'query']);
    Route::pattern('entity', '[0-9]{1,19}');
    Route::pattern('relation', '[0-9]{1,19}');
    Route::post('entities/{entity}/restore', [Entities::class, 'restore']);
    Route::apiResource('entities', Entities::class);
    Route::apiResource('relations', Relations::class);
});
