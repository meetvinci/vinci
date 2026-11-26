<?php

use App\Accounts\Sessions;

// Sanctum's tokens are the logins: one per browser, in the HttpOnly vinci_session cookie (see App\Accounts\Sessions).
return [
    // Only tokens: the API keeps no Laravel session for a login, so ending a token ends the login everywhere.
    'guard' => [],
    // A login lasts at most this long, whatever its own expiry says.
    'expiration' => Sessions::LIFETIME_SECONDS / 60,
    // No /sanctum/csrf-cookie route: nothing here is an SPA on this origin.
    'routes' => false,
];
