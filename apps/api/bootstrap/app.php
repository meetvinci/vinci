<?php

use App\Accounts\Sessions;
use App\Http\Middleware\FormToken;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    // Include current and previous entity schemas when Laravel enumerates tables for migrations and schema maintenance.
    ->registered(fn () => config([
        'database.connections.pgsql.search_path' => 'public,entity,entity_data',
        'database.connections.pgsql.dont_drop' => ['public.spatial_ref_sys'],
    ]))
    ->withRouting(using: function () {
        require __DIR__.'/../routes/web.php';
        Route::prefix('api')->group(__DIR__.'/../routes/api.php');
    })
    ->withCommands()
    ->withMiddleware(function (Middleware $middleware) {
        $entityApi = fn (Request $request) => $request->is('api/*');
        $middleware->trimStrings(except: [$entityApi]);
        $middleware->convertEmptyStringsToNull(except: [$entityApi]);
        // Sanctum reads the login token as is, also on the routes without the cookie middleware.
        $middleware->encryptCookies(except: [Sessions::COOKIE]);
        // No login route to send guests to: an unknown or ended login is a 401 for the hub.
        $middleware->redirectGuestsTo(fn () => null);
        // Reached only through the edge (Caddy), which sets X-Forwarded-For, and from the hub: the login rate limit
        // counts the visitor's address, not Caddy's.
        $middleware->trustProxies(at: '*');
        $middleware->web(replace: [PreventRequestForgery::class => FormToken::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*'));
        // An expired login form (Laravel turns the CSRF mismatch into a 419): show a fresh one rather than an error.
        // Every other error is its status alone, with an HTTP error's own headers (Allow, Retry-After): no message,
        // stack or wording that names the framework.
        $exceptions->render(fn (Throwable $error, Request $request) => match (true) {
            $request->is('api/*') => null,
            $error instanceof HttpResponseException => null,
            $error->getPrevious() instanceof TokenMismatchException => response('', 302, ['Location' => '/auth/login?redirect_url='.rawurlencode((string) $request->input('redirect_url', '/'))]),
            $error instanceof HttpExceptionInterface => response('', $error->getStatusCode(), $error->getHeaders()),
            // No login, or an ended one, at the hub's /internal/session routes.
            $error instanceof AuthenticationException => response('', 401),
            $error instanceof ValidationException => response('', $error->status),
            default => response('', 500),
        });
    })
    ->create();
