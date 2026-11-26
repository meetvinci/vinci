# Vinci API

The Laravel API starts with the main Vinci Docker stack as the `api` service.
Laravel connects to the `vinci` PostgreSQL database over the internal `api` network. The stack
keeps its data in the `postgres-data` volume.
`GET /` returns HTTP 200 with the body `ok`. The image uses this route for its health check.
The image runs the migrations at every start, before Apache.

With `VINCI_AUTH=laravel` this app is the install's login, in place of Cloudflare Access: the
`/cdn-cgi/access/*` pages, Sanctum tokens as logins in the `vinci_session` cookie, the hub's `/internal/session`
(check a login, change one's own password) and `/internal/users/*` routes, and `php artisan vinci:user`.
See "Login with Vinci accounts" in `docs/team-workspace/install.md` and `.agents/references/team-workspace.md`.

Build the image from the repository root with `bun run build:images api`.
On an installed stack, check the route with:

```sh
docker compose exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8080/");'
```
