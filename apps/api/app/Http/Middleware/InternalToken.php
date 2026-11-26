<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Only the hub holds API_INTERNAL_TOKEN; the edge never routes /internal.
class InternalToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = (string) config('vinci.internal_token');

        if ($token === '' || ! hash_equals("Bearer {$token}", (string) $request->header('Authorization'))) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        return $next($request);
    }
}
