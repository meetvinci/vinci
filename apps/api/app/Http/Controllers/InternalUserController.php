<?php

namespace App\Http\Controllers;

use App\Accounts\Accounts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

// The hub's admin panel: add, reset and remove the accounts people log in with.
class InternalUserController
{
    public function __construct(private readonly Accounts $accounts) {}

    public function put(Request $request, string $email): JsonResponse
    {
        $name = $request->validate(['name' => ['nullable', 'string', 'max:100']])['name'] ?? null;

        return $this->guard(fn () => response()->json($this->accounts->ensure($email, $name)));
    }

    public function password(string $email): JsonResponse
    {
        return $this->guard(function () use ($email) {
            $user = $this->accounts->find($email);

            return $user === null
                ? response()->json(['message' => 'No such account.'], 404)
                : response()->json(['password' => $this->accounts->resetPassword($user)]);
        });
    }

    public function delete(string $email): JsonResponse
    {
        return $this->guard(fn () => response()->json(['deleted' => $this->accounts->delete($email)]));
    }

    private function guard(callable $action): JsonResponse
    {
        try {
            return $action();
        } catch (InvalidArgumentException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        }
    }
}
