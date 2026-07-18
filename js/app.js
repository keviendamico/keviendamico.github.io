document.getElementById('year').textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

const GITHUB_USER = 'keviendamico';

// GitHub linguist-ish colors for the language dot.
const LANGUAGE_COLORS = {
  Java: '#b07219',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  Python: '#3572A5',
};

function languageColor(language) {
  return LANGUAGE_COLORS[language] || '#8b949e';
}

const MAX_LANGS_SHOWN = 4;
const LANG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCachedLanguages(repo) {
  try {
    const raw = localStorage.getItem(`gh-langs:${repo.full_name}`);
    if (!raw) return null;
    const { languages, ts } = JSON.parse(raw);
    if (Date.now() - ts > LANG_CACHE_TTL_MS) return null;
    return languages;
  } catch {
    return null;
  }
}

function setCachedLanguages(repo, languages) {
  try {
    localStorage.setItem(`gh-langs:${repo.full_name}`, JSON.stringify({ languages, ts: Date.now() }));
  } catch {
    // localStorage unavailable (e.g. private browsing) — caching is best-effort.
  }
}

// GitHub's repo list only exposes the primary language, so each repo's full
// language breakdown needs its own request. Cached in localStorage since
// unauthenticated requests are capped at 60/hour.
async function fetchRepoLanguages(repo) {
  const cached = getCachedLanguages(repo);
  if (cached) return cached;

  try {
    const res = await fetch(repo.languages_url);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const languages = Object.keys(data).sort((a, b) => data[b] - data[a]);
    setCachedLanguages(repo, languages);
    return languages;
  } catch (err) {
    console.error(err);
    return repo.language ? [repo.language] : [];
  }
}

function renderLangDots(languages) {
  if (!languages || languages.length === 0) return '';
  const shown = languages.slice(0, MAX_LANGS_SHOWN);
  const dots = shown
    .map(
      (lang) => `
        <span class="project-card__lang">
          <span class="project-card__lang-dot" style="background:${languageColor(lang)}"></span>
          ${lang}
        </span>`
    )
    .join('');
  const extra = languages.length - shown.length;
  const extraBadge = extra > 0 ? `<span class="project-card__lang project-card__lang--extra">+${extra}</span>` : '';
  return `<span class="project-card__langs">${dots}${extraBadge}</span>`;
}

// Multi-repo systems get collapsed into a single featured card instead of
// one near-identical card per repo.
const PROJECT_GROUPS = [
  {
    match: (name) => name.startsWith('ecommerce-spring-cloud'),
    title: 'E-commerce microservices (Spring Cloud)',
    description:
      'Java/Spring Cloud microservices stack for an e-commerce system: API Gateway, ' +
      'Discovery Server (Eureka), centralized Config Server, and order, product and ' +
      'inventory services communicating via OpenFeign with Resilience4j circuit breakers.',
  },
  {
    match: (name) => name.startsWith('ecommerce-ms-'),
    title: 'E-commerce event-driven (Kafka)',
    description:
      'Event-driven distributed e-commerce system built with Apache Kafka and shared ' +
      'Avro schemas: a choreography-based saga pattern with no central orchestrator, ' +
      'handling orders, payments, inventory and notifications.',
  },
  {
    match: (name) => name.startsWith('bff-'),
    title: 'BFF stack for a Keycloak-secured SPA',
    description:
      'Two-service Backend-for-Frontend for a browser-based SPA: bff-gateway handles ' +
      'the OAuth2 Authorization Code Flow (PKCE) with Keycloak and keeps all tokens ' +
      'server-side via Redis-backed sessions, exposing only an HTTP-only cookie to ' +
      'the browser; bff-authorization validates Keycloak tokens, auto-provisions ' +
      'users, syncs roles, and issues signed RS256 internal JWTs (no PII), reachable ' +
      'only from the gateway. Built with Spring Boot 4 (Spring Cloud Gateway/WebFlux ' +
      'and Spring MVC), PostgreSQL + Flyway.',
  },
];

function buildGroupedProjects(repos) {
  const groups = PROJECT_GROUPS.map((g) => ({ ...g, repos: [] }));
  const singles = [];

  repos.forEach((repo) => {
    const group = groups.find((g) => g.match(repo.name));
    if (group) {
      group.repos.push(repo);
    } else {
      singles.push(repo);
    }
  });

  const featured = groups
    .filter((g) => g.repos.length > 0)
    .map((g) => ({
      featured: true,
      title: g.title,
      description: g.description,
      languages: Array.from(new Set(g.repos.flatMap((r) => r.languages || (r.language ? [r.language] : [])))),
      subRepos: g.repos.sort((a, b) => a.name.localeCompare(b.name)),
      pushed_at: g.repos.reduce(
        (latest, r) => (r.pushed_at > latest ? r.pushed_at : latest),
        g.repos[0].pushed_at
      ),
    }));

  return [...featured, ...singles].sort((a, b) => {
    const dateA = a.pushed_at;
    const dateB = b.pushed_at;
    return new Date(dateB) - new Date(dateA);
  });
}

function renderFeaturedCard(project) {
  const subRepoLinks = project.subRepos
    .map((r) => `<li><a href="${r.html_url}" target="_blank" rel="noopener">${r.name.replace('ecommerce-', '')}</a></li>`)
    .join('');

  return `
    <div class="project-card project-card--featured">
      <h3 class="project-card__title">${project.title}</h3>
      <p class="project-card__desc">${project.description}</p>
      <ul class="project-card__subrepos">${subRepoLinks}</ul>
      <div class="project-card__meta">
        ${renderLangDots(project.languages)}
        <span>${project.subRepos.length} repository</span>
        <a class="project-card__more" href="https://github.com/${GITHUB_USER}?tab=repositories" target="_blank" rel="noopener">Vedi tutti su GitHub →</a>
      </div>
    </div>
  `;
}

function renderRepoCard(repo) {
  const description = repo.description || 'No description available.';
  return `
    <a class="project-card" href="${repo.html_url}" target="_blank" rel="noopener">
      <h3 class="project-card__title">${repo.name}</h3>
      <p class="project-card__desc">${description}</p>
      <div class="project-card__meta">
        ${renderLangDots(repo.languages)}
        ${repo.stargazers_count > 0 ? `<span>★ ${repo.stargazers_count}</span>` : ''}
      </div>
    </a>
  `;
}

async function loadProjects() {
  const grid = document.getElementById('projects-grid');
  try {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = await res.json();
    const visible = repos.filter((r) => !r.fork);

    if (visible.length === 0) {
      grid.innerHTML = '<p class="projects-status">Nessun repository pubblico trovato.</p>';
      return;
    }

    await Promise.all(
      visible.map(async (r) => {
        r.languages = await fetchRepoLanguages(r);
      })
    );

    const projects = buildGroupedProjects(visible);
    grid.innerHTML = projects
      .map((p) => (p.featured ? renderFeaturedCard(p) : renderRepoCard(p)))
      .join('');
  } catch (err) {
    grid.innerHTML = `
      <p class="projects-status">
        Non è stato possibile caricare i progetti da GitHub in questo momento.
        Puoi vederli direttamente su
        <a href="https://github.com/${GITHUB_USER}" target="_blank" rel="noopener">github.com/${GITHUB_USER}</a>.
      </p>
    `;
    console.error(err);
  }
}

loadProjects();
