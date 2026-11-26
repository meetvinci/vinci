<?php

use App\Http\Controllers\AccessController;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(using: fn () => require __DIR__.'/../routes/web.php')
    ->withCommands()
    ->withMiddleware(function (Middleware $middleware) {
        // The hub reads the login token as is.
        $middleware->encryptCookies(except: [AccessController::COOKIE]);
        // Reached only through the edge (Caddy), which sets X-Forwarded-For, and from the hub: the login rate limit
        // counts the visitor's address, not Caddy's.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // An expired form: show a fresh one rather than an error.
        $exceptions->render(fn (TokenMismatchException $error, Request $request) => response('', 302, [
            'Location' => '/cdn-cgi/access/login?redirect_url='.rawurlencode((string) $request->input('redirect_url', '/')),
        ]));
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })
    ->create();
