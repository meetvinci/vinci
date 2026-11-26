<?php

namespace App\Http\Controllers;

use App\Accounts\Accounts;
use App\Accounts\LoginLimits;
use App\Accounts\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

// The hub, on behalf of a browser: it passes the browser's vinci_session cookie, and Sanctum resolves the login.
class InternalSessionController
{
    // Shortest new password: the generated ones have 20 characters.
    public const PASSWORD_MIN = 12;

    public function __construct(private readonly Accounts $accounts, private readonly LoginLimits $limits) {}

    // Who this login belongs to, and when it ends at the latest.
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $token = $user->currentAccessToken();
        $ends = $token->created_at->addSeconds(Sessions::LIFETIME_SECONDS);
        $ends = $token->expires_at?->lt($ends) ? $token->expires_at : $ends;

        return response()->json(['email' => $user->email, 'expires_at' => $ends->getTimestamp()]);
    }

    // The person's own password change, with their current password. Wrong ones count toward the login limit.
    public function password(Request $request): JsonResponse
    {
        ['current' => $current, 'password' => $password] = $request->validate([
            'current' => ['required', 'string'],
            'password' => ['required', 'string', 'min:'.self::PASSWORD_MIN, 'max:200'],
        ]);
        $user = $request->user();
        $seconds = $this->limits->wait($user->email, null);

        if ($seconds !== null) {
            return response()->json(['error' => 'too_many_attempts', 'seconds' => $seconds], 429);
        }

        if (! Hash::check($current, $user->password)) {
            $this->limits->failed($user->email, null);

            return response()->json(['error' => 'wrong_password'], 403);
        }

        $this->limits->clear($user->email, null);
        $this->accounts->changePassword($user, $password, $user->currentAccessToken());

        return response()->json(['changed' => true]);
    }
}
