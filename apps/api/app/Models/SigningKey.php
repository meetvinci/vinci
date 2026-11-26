<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// An RSA key that signs login tokens. Its public half is served at /cdn-cgi/access/certs.
class SigningKey extends Model
{
    protected $fillable = ['kid', 'private_key'];

    protected $hidden = ['private_key'];

    protected function casts(): array
    {
        return ['private_key' => 'encrypted'];
    }

    // The public key as a JWK, the shape Cloudflare Access serves.
    public function jwk(): array
    {
        $rsa = openssl_pkey_get_details(openssl_pkey_get_private($this->private_key))['rsa'];

        return [
            'kid' => $this->kid,
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'n' => self::base64url($rsa['n']),
            'e' => self::base64url($rsa['e']),
        ];
    }

    private static function base64url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
