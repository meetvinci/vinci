<?php

namespace App\Accounts;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

// A login is a Sanctum token kept in the browser's vinci_session cookie. The hub checks it with the API on every
// request (GET /internal/session), so deleting the token ends the login at once.
class Sessions
{
    public const COOKIE = 'vinci_session';

    // How long a login lasts: the token's lifetime and the cookie's.
    public const LIFETIME_SECONDS = 7 * 86400;

    public function start(User $user): string
    {
        return $user->createToken('login', expiresAt: now()->addSeconds(self::LIFETIME_SECONDS))->plainTextToken;
    }

    public function end(?string $token): void
    {
        if ($token !== null && $token !== '') {
            PersonalAccessToken::findToken($token)?->delete();
        }
    }

    // Every login of this person, but the one in $keep.
    public function endAll(User $user, ?PersonalAccessToken $keep = null): void
    {
        $user->tokens()->when($keep !== null, fn ($query) => $query->whereKeyNot($keep->getKey()))->delete();
    }
}
