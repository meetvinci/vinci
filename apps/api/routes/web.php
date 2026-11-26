<?php

use App\Http\Controllers\AccessController;
use App\Http\Controllers\InternalSessionController;
use App\Http\Controllers\InternalUserController;
use App\Http\Middleware\InternalToken;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => 'ok');

// Login (VINCI_AUTH=laravel), public through the edge. Only the form needs a session, for its CSRF token.
Route::prefix('cdn-cgi/access')->group(function () {
    Route::middleware('web')->group(function () {
        Route::get('login', [AccessController::class, 'form']);
        Route::post('login', [AccessController::class, 'login'])->middleware('throttle:30,1');
    });
    Route::get('logout', [AccessController::class, 'logout']);
    Route::any('required', [AccessController::class, 'required']);
});

// The hub only: the edge never routes /internal, and only the hub shares a network with this app besides Caddy.
// A browser's login, from the vinci_session cookie the hub passes on.
Route::prefix('internal/session')->middleware([InternalToken::class, 'auth:sanctum'])->group(function () {
    Route::get('/', [InternalSessionController::class, 'show']);
    Route::post('password', [InternalSessionController::class, 'password'])->middleware('throttle:30,1');
});

// The hub's admin panel.
Route::prefix('internal/users/{email}')->middleware(InternalToken::class)->group(function () {
    Route::put('/', [InternalUserController::class, 'put']);
    Route::post('password', [InternalUserController::class, 'password']);
    Route::delete('/', [InternalUserController::class, 'delete']);
});
