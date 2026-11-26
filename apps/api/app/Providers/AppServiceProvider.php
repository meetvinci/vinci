<?php

namespace App\Providers;

use App\Accounts\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // The login token comes in its cookie, never in Authorization: that header carries the hub's internal token.
        Sanctum::getAccessTokenFromRequestUsing(fn (Request $request) => $request->cookie(Sessions::COOKIE));
    }
}
