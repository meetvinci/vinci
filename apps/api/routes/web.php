<?php

use App\Http\Controllers\AccessController;
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
    Route::get('certs', [AccessController::class, 'certs']);
    Route::any('required', [AccessController::class, 'required']);
});

// The hub's admin panel only: the edge never routes /internal, and only the hub shares a network with this app.
Route::prefix('internal/users/{email}')->middleware(InternalToken::class)->group(function () {
    Route::put('/', [InternalUserController::class, 'put']);
    Route::post('password', [InternalUserController::class, 'password']);
    Route::delete('/', [InternalUserController::class, 'delete']);
});
