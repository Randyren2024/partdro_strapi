<script setup lang="ts">
</script>

<template>
  <div class="shell">
    <header class="site-header">
      <NuxtLink to="/" class="brand">
        PARTDRO<span class="brand-dot">.</span>
      </NuxtLink>
      <nav class="site-nav">
        <NuxtLink to="/">Products</NuxtLink>
        <NuxtLink to="/ingest">Ingest</NuxtLink>
      </nav>
    </header>
    <main>
      <NuxtPage />
    </main>
    <footer class="site-footer">
      <span>© 2026 Partdro</span>
      <span class="footer-meta">Nuxt · Strapi · Supabase</span>
    </footer>
  </div>
</template>

<style>
:root {
  --ink: #0c0f12;
  --ink-soft: #3d454e;
  --paper: #f4f2ec;
  --card: #ffffff;
  --line: rgba(12, 15, 18, 0.14);
  --accent: #ff5a1f;
  --accent-ink: #cc3f0d;
  --ok: #0a7d4f;
  --font-display: 'Bahnschrift', 'Segoe UI', 'PingFang SC', sans-serif;
  --font-body: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: 'Consolas', ui-monospace, 'Courier New', monospace;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.shell { min-height: 100vh; display: flex; flex-direction: column; }
main { flex: 1; }

/* ---------- chrome ---------- */
.site-header {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 clamp(16px, 4vw, 48px);
  height: 64px;
  background: rgba(12, 15, 18, 0.92);
  color: var(--paper);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(244, 242, 236, 0.12);
}
.brand {
  font-family: var(--font-display);
  font-size: 20px; letter-spacing: 0.18em; font-weight: 700;
  color: var(--paper); text-decoration: none;
  font-stretch: 92%;
}
.brand-dot { color: var(--accent); }
.site-nav a {
  color: rgba(244, 242, 236, 0.75); text-decoration: none;
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em;
  text-transform: uppercase; margin-left: 24px;
}
.site-nav a:hover { color: var(--accent); }

.site-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px clamp(16px, 4vw, 48px);
  background: var(--ink); color: rgba(244, 242, 236, 0.6);
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em;
}
.footer-meta { opacity: 0.6; }

/* ---------- shared section language ---------- */
.section { padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px); border-top: 1px solid var(--line); }
.section--dark { background: var(--ink); color: var(--paper); border-top: none; }
.container { max-width: 1120px; margin: 0 auto; }

.eyebrow {
  font-family: var(--font-mono);
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--accent-ink); margin: 0 0 12px;
}
.section--dark .eyebrow { color: var(--accent); }

h1, h2, h3 { font-family: var(--font-display); font-stretch: 94%; margin: 0; }
h2 { font-size: clamp(28px, 4vw, 44px); font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
h3 { font-size: 18px; font-weight: 600; }

.body-text { max-width: 62ch; color: var(--ink-soft); white-space: pre-line; }
.section--dark .body-text { color: rgba(244, 242, 236, 0.72); }

.chip {
  display: inline-block;
  font-family: var(--font-mono); font-size: 12px;
  padding: 3px 10px;
  border: 1px solid var(--line); border-radius: 3px;
  color: var(--ink-soft); background: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}
.section--dark .chip { color: rgba(244,242,236,.8); background: rgba(244,242,236,.08); border-color: rgba(244,242,236,.2); }

.btn {
  display: inline-block;
  font-family: var(--font-display); font-stretch: 92%;
  font-size: 15px; letter-spacing: 0.08em;
  padding: 14px 28px;
  background: var(--accent); color: #fff;
  text-decoration: none; text-transform: uppercase;
  border: none; border-radius: 3px; cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn:hover { background: var(--accent-ink); transform: translateY(-1px); }
.btn--ghost { background: transparent; color: var(--paper); border: 1px solid rgba(244, 242, 236, 0.4); }
.btn--ghost:hover { background: rgba(244, 242, 236, 0.1); border-color: var(--paper); }

img { display: block; max-width: 100%; }

/* page transition */
.page-enter-active, .page-leave-active { transition: opacity 0.18s ease; }
.page-enter-from, .page-leave-to { opacity: 0; }
</style>
