<?php

namespace App\Accounts;

use Illuminate\Support\Facades\RateLimiter;

// Wrong passwords allowed, at the login form and at a password change. Counted in PostgreSQL (CACHE_STORE database),
// shared by every Apache worker; `php artisan cache:clear` lifts every lock.
class LoginLimits
{
    // Wrong passwords allowed per email and address in a window of DECAY seconds.
    private const ATTEMPTS = 5;

    private const DECAY = 60;

    // Wrong passwords allowed per email from all addresses together in EMAIL_DECAY seconds: guesses spread over many
    // addresses stay capped. Unknown emails count the same, so the limit does not tell which accounts exist.
    private const EMAIL_ATTEMPTS = 20;

    private const EMAIL_DECAY = 3600;

    // Seconds until this email may try again, or null when it may now. Without an address, only the email's limit.
    public function wait(string $email, ?string $address): ?int
    {
        $blocked = array_filter(self::limits($email, $address), fn (array $limit) => RateLimiter::tooManyAttempts($limit[0], $limit[1]));

        return $blocked === [] ? null : max(array_map(fn (array $limit) => RateLimiter::availableIn($limit[0]), $blocked));
    }

    public function failed(string $email, ?string $address): void
    {
        foreach (self::limits($email, $address) as [$key, , $decay]) {
            RateLimiter::hit($key, $decay);
        }
    }

    public function clear(string $email, ?string $address): void
    {
        foreach (self::limits($email, $address) as [$key]) {
            RateLimiter::clear($key);
        }
    }

    /** @return list<array{string, int, int}> */
    private static function limits(string $email, ?string $address): array
    {
        return [
            ...($address === null ? [] : [['login|'.$email.'|'.$address, self::ATTEMPTS, self::DECAY]]),
            ['login-email|'.$email, self::EMAIL_ATTEMPTS, self::EMAIL_DECAY],
        ];
    }
}
