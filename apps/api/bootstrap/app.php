<?php

use App\Accounts\Sessions;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(using: fn () => require __DIR__.'/../routes/web.php')
    ->withCommands()
    ->withMiddleware(function (Middleware $middleware) {
        // Sanctum reads the login token as is, also on the routes without the cookie middleware.
        $middleware->encryptCookies(except: [Sessions::COOKIE]);
        // No login route to send guests to: an unknown or ended login is a 401 for the hub.
        $middleware->redirectGuestsTo(fn () => null);
        // Reached only through the edge (Caddy), which sets X-Forwarded-For, and from the hub: the login rate limit
        // counts the visitor's address, not Caddy's.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // An expired login form (Laravel turns the CSRF mismatch into a 419): show a fresh one rather than an error.
        $exceptions->render(fn (HttpException $error, Request $request) => $error->getPrevious() instanceof TokenMismatchException
            ? response('', 302, ['Location' => '/cdn-cgi/access/login?redirect_url='.rawurlencode((string) $request->input('redirect_url', '/'))])
            : null);
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })
    ->create();
