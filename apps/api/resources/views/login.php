<?php /** @var ?string $error @var string $email @var string $redirectUrl */ ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex">
  <title>Log in · Vinci</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    :root { --bg: #fafafa; --card: #fff; --text: #0a0a0a; --muted: #737373; --border: #e5e5e5; --accent: #0a0a0a; --accent-text: #fafafa; --error: #b91c1c; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0a0a0a; --card: #171717; --text: #fafafa; --muted: #a3a3a3; --border: #262626; --accent: #fafafa; --accent-text: #0a0a0a; --error: #f87171; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: var(--bg); color: var(--text); font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { width: 100%; max-width: 22rem; padding: 2rem; background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; }
    h1 { margin: 0 0 0.25rem; font-size: 1.25rem; font-weight: 600; }
    p { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.875rem; }
    label { display: block; margin-bottom: 1rem; font-size: 0.875rem; font-weight: 500; }
    input { display: block; width: 100%; margin-top: 0.375rem; padding: 0.5rem 0.75rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--border); border-radius: 0.5rem; }
    input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    button { width: 100%; margin-top: 0.5rem; padding: 0.5rem; font: inherit; font-weight: 500; color: var(--accent-text); background: var(--accent); border: 0; border-radius: 0.5rem; cursor: pointer; }
    [role="alert"] { margin: 0 0 1rem; color: var(--error); font-size: 0.875rem; }
  </style>
</head>
<body>
  <main>
    <h1>Log in to Vinci</h1>
    <p>Use the email and password your admin gave you.</p>
    <?php if ($error !== null) { ?>
      <div role="alert"><?= e($error) ?></div>
    <?php } ?>
    <form method="post" action="/cdn-cgi/access/login">
      <input type="hidden" name="_token" value="<?= e(csrf_token()) ?>">
      <input type="hidden" name="redirect_url" value="<?= e($redirectUrl) ?>">
      <label>Email<input type="email" name="email" value="<?= e($email) ?>" autocomplete="username" required autofocus></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit">Log in</button>
    </form>
  </main>
</body>
</html>
