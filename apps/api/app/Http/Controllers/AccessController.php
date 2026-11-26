<?php

namespace App\Http\Controllers;

use App\Accounts\Accounts;
use App\Accounts\LoginLimits;
use App\Accounts\Sessions;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Cookie;

// Login for VINCI_AUTH=laravel, at the paths Cloudflare Access uses: the edge (Caddy) sends /cdn-cgi/access/* here
// and every other path to the hub, which checks the vinci_session cookie set here with GET /internal/session.
class AccessController
{
    private const LOGIN = '/cdn-cgi/access/login';

    // The login pages are never framed, sniffed or sent as a referrer to another site.
    private const HEADERS = [
        'Cache-Control' => 'no-store',
        'Content-Security-Policy' => "frame-ancestors 'none'",
        'X-Content-Type-Options' => 'nosniff',
        'Referrer-Policy' => 'same-origin',
    ];

    // A failed password check costs as much for an unknown email, so timing does not tell which accounts exist.
    private const DUMMY_HASH = '$2y$12$Dj5L3obSv2UhUn449AaQ9.O/ibOZHEpivWRY06BkB6m77D/b1c6CC';

    public function __construct(private readonly Accounts $accounts, private readonly Sessions $sessions, private readonly LoginLimits $limits) {}

    public function form(Request $request): Response
    {
        return $this->page($request, '', null, 200);
    }

    public function login(Request $request): Response
    {
        ['email' => $email, 'password' => $password] = $request->validate(['email' => ['required', 'string'], 'password' => ['required', 'string']]);
        $email = Str::lower(trim($email));
        $seconds = $this->limits->wait($email, $request->ip());

        if ($seconds !== null) {
            return $this->page($request, $email, 'Too many attempts. Try again in '.$seconds.' seconds.', 429);
        }

        try {
            $user = $this->accounts->find($email);
        } catch (InvalidArgumentException) {
            $user = null;
        }

        if (! Hash::check($password, $user?->password ?? self::DUMMY_HASH) || $user === null) {
            $this->limits->failed($email, $request->ip());

            return $this->page($request, $email, 'Wrong email or password.', 401);
        }

        $this->limits->clear($email, $request->ip());
        $request->session()->regenerate();

        return $this->redirect(self::safePath($request->input('redirect_url')))
            ->withCookie($this->cookie($this->sessions->start($user), Sessions::LIFETIME_SECONDS / 60));
    }

    // Ends this browser's login in the API, not only its cookie: a copy of the cookie stops working too.
    public function logout(Request $request): Response
    {
        $this->sessions->end($request->cookie(Sessions::COOKIE));

        return $this->redirect(self::LOGIN)->withCookie($this->cookie('', -1));
    }

    // The edge sends a request without the login cookie here, with its path and query in X-Vinci-Original-Uri.
    public function required(Request $request): Response
    {
        $target = self::safePath($request->header('X-Vinci-Original-Uri'));

        return $this->redirect(self::LOGIN.($target === '/' ? '' : '?redirect_url='.rawurlencode($target)));
    }

    // Only a path on this site: never another origin (//host, /\host), never back to the login pages.
    private static function safePath(mixed $path): string
    {
        $isSafe = is_string($path)
            && preg_match('#^/(?![/\\\\])[^\\\\\x00-\x20\x7f]*$#', $path) === 1
            && ! str_starts_with($path, '/cdn-cgi/');

        return $isSafe ? $path : '/';
    }

    private function page(Request $request, string $email, ?string $error, int $status): Response
    {
        return response()->view('login', [
            'error' => $error,
            'email' => $email,
            'redirectUrl' => self::safePath($request->input('redirect_url')),
        ], $status)->withHeaders(self::HEADERS);
    }

    // Relative, so it works whatever host and port the edge answers on.
    private function redirect(string $path): Response
    {
        return response('', 302, ['Location' => $path, ...self::HEADERS]);
    }

    private function cookie(string $value, int $minutes): Cookie
    {
        return cookie(Sessions::COOKIE, $value, $minutes, '/', null, true, true, true, 'lax');
    }
}
