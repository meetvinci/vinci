<?php

namespace App;

use Closure;
use Illuminate\Http\Request;

class SharedToken
{
    public function handle(Request $request, Closure $next)
    {
        $token = config('bots.token');
        abort_unless(is_string($token) && $token !== '' && hash_equals($token, $request->bearerToken() ?? ''), 401);
        return $next($request);
    }
}
