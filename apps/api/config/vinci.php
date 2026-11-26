<?php

// Laravel mode (VINCI_AUTH=laravel): this app plays Cloudflare Access for the hub. It signs the login cookie with its
// own key, served at /cdn-cgi/access/certs, and the hub trusts that key because ACCESS_TEAM_DOMAIN points here.
return [
    // The issuer the hub checks: its ACCESS_TEAM_DOMAIN, http://api:8080 in a team install.
    'team_domain' => env('ACCESS_TEAM_DOMAIN'),
    // The audience the hub checks: its ACCESS_AUD.
    'audience' => env('ACCESS_AUD'),
    // The bearer secret of the hub's /internal/users routes.
    'internal_token' => env('API_INTERNAL_TOKEN'),
];
