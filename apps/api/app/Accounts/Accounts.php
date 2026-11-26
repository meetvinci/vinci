<?php

namespace App\Accounts;

use App\Models\User;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Sanctum\PersonalAccessToken;

// The people who can log in. The hub's admin panel and `php artisan vinci:user` change them; passwords are made here,
// random, and shown once. A new password or a removed account ends the person's logins.
class Accounts
{
    public function __construct(private readonly Sessions $sessions) {}

    public static function normalize(string $email): string
    {
        $email = Str::lower(trim($email));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('Not an email address.');
        }

        return $email;
    }

    public function find(string $email): ?User
    {
        return User::query()->where('email', self::normalize($email))->first();
    }

    /** @return array{created: bool, password?: string} */
    public function ensure(string $email, ?string $name): array
    {
        $email = self::normalize($email);
        $user = $this->find($email);

        if ($user !== null) {
            if ($name !== null) {
                $user->update(['name' => $name]);
            }

            return ['created' => false];
        }

        $password = self::password();
        User::query()->create(['email' => $email, 'name' => $name, 'password' => $password]);

        return ['created' => true, 'password' => $password];
    }

    public function resetPassword(User $user): string
    {
        $password = self::password();
        $user->update(['password' => $password]);
        $this->sessions->endAll($user);

        return $password;
    }

    // The person's own change: their other logins end, the one they changed it from stays.
    public function changePassword(User $user, string $password, PersonalAccessToken $current): void
    {
        $user->update(['password' => $password]);
        $this->sessions->endAll($user, $current);
    }

    public function delete(string $email): bool
    {
        $user = $this->find($email);

        if ($user === null) {
            return false;
        }

        $this->sessions->endAll($user);

        return $user->delete();
    }

    private static function password(): string
    {
        return Str::password(20, symbols: false);
    }
}
