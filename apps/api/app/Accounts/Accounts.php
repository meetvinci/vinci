<?php

namespace App\Accounts;

use App\Models\User;
use Illuminate\Support\Str;
use InvalidArgumentException;

// The people who can log in. The hub's admin panel and `php artisan vinci:user` change them; passwords are made here,
// random, and shown once.
class Accounts
{
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
        $user = $this->find($email);

        if ($user !== null) {
            if ($name !== null) {
                $user->update(['name' => $name]);
            }

            return ['created' => false];
        }

        $password = self::password();
        User::query()->create(['email' => self::normalize($email), 'name' => $name, 'password' => $password]);

        return ['created' => true, 'password' => $password];
    }

    public function resetPassword(User $user): string
    {
        $password = self::password();
        $user->update(['password' => $password]);

        return $password;
    }

    public function delete(string $email): bool
    {
        return User::query()->where('email', self::normalize($email))->delete() > 0;
    }

    private static function password(): string
    {
        return Str::password(20, symbols: false);
    }
}
