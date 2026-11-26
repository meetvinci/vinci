<?php

namespace App\Accounts;

use App\Models\SigningKey;
use App\Models\User;
use Firebase\JWT\JWT;

// Signs the login tokens the hub verifies like Cloudflare Access tokens. The first key is made on first use and kept
// in PostgreSQL: the container's root is read-only.
class AccessTokens
{
    public function issue(User $user): string
    {
        $key = $this->key();
        $now = time();

        return JWT::encode([
            'iss' => config('vinci.team_domain'),
            'aud' => [config('vinci.audience')],
            'email' => $user->email,
            'sub' => (string) $user->id,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $this->lifetimeSeconds(),
        ], $key->private_key, 'RS256', $key->kid);
    }

    public function lifetimeSeconds(): int
    {
        return config('vinci.session_days') * 86400;
    }

    public function jwks(): array
    {
        $this->key();

        return ['keys' => SigningKey::query()->orderBy('id')->get()->map->jwk()->all()];
    }

    // Two workers starting at once may each add a key; both are served, and the oldest signs.
    private function key(): SigningKey
    {
        $key = SigningKey::query()->orderBy('id')->first();

        if ($key !== null) {
            return $key;
        }

        openssl_pkey_export(openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]), $pem);
        SigningKey::query()->create(['kid' => bin2hex(random_bytes(16)), 'private_key' => $pem]);

        return SigningKey::query()->orderBy('id')->firstOrFail();
    }
}
