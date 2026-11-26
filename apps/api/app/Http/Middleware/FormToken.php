<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

// The login form carries its CSRF token in the page, so no XSRF-TOKEN cookie, which only names the framework.
class FormToken extends PreventRequestForgery
{
    protected $addHttpCookie = false;
}
