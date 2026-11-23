# Vinci API

The Laravel API starts with the main Vinci Docker stack as the `api` service.
`GET /` returns HTTP 200 with the body `ok`. The image uses this route for its health check.

Build the image from the repository root with `bun run build:images api`.
On an installed stack, check the route with:

```sh
docker compose exec -T api php -r 'echo file_get_contents("http://127.0.0.1:8080/");'
```
