// Scraper del portal ACI-ASQ (Survey Management Tool) -> Postgres.
// Recorre TODOS los aeropuertos del desplegable x TODAS las temporadas (Regional),
// lee el Sample Plan (Airline-Destination: Original Target + Collected) y guarda en
// la BD. "Solo el más reciente": upsert por (aeropuerto, temporada) — reejecutar
// reemplaza las filas de esa combinación. Usa Microsoft Edge vía Playwright.
//
// DOM real (calibrado 2026-07): la página /compliance tiene <select> nativos
//   #airportDropDown (name SelectedAirport; value = código, texto "PMC -- ...")
//   #terminalDropDown, #surveyDropDown, #periodDropDown  -> se llenan EN CASCADA
//   por AJAX al elegir aeropuerto. Botón #samplePlanSelectorBtn = "Select".
//
// Variables de entorno (se cargan con `node --env-file=.env`):
//   ASQ_BASE_URL         default https://smt.v2.asq.aci.aero
//   ASQ_USERNAME         usuario ASQ (ej. r.delpiano)
//   ASQ_PASSWORD         clave ASQ
//   ASQ_AIRPORTS         "all" (default) o lista "PMC,IQQ,CJC"
//   ASQ_SEASONS          "all" (default) o lista "Summer-2026,Winter-2025-26"
//   ASQ_BROWSER_CHANNEL  default "msedge" (Edge del sistema; sin descargar Chromium)
//   ASQ_MODE             "scrape" (default) | "inspect" (vuelca el DOM y para)
//   DATABASE_URL         Postgres destino (local o Neon)
//   HEADLESS             "true" (default) | "false" (ver el navegador)
//   DRY_RUN              "true" => scrapea e imprime, no escribe en la BD
//
// Uso:
//   npm run scrape:asq                              (scrape real)
//   HEADLESS=false DRY_RUN=true npm run scrape:asq  (calibración en seco, visible)
//   ASQ_MODE=inspect HEADLESS=false npm run scrape:asq  (volcar DOM real)

import pg from "pg";
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const {
  ASQ_BASE_URL = "https://smt.v2.asq.aci.aero",
  ASQ_USERNAME,
  ASQ_PASSWORD,
  ASQ_AIRPORTS = "all",
  ASQ_SEASONS = "all",
  ASQ_BROWSER_CHANNEL = "msedge",
  ASQ_MODE = "scrape",
  DATABASE_URL,
  HEADLESS = "true",
  DRY_RUN,
} = process.env;

const headless = HEADLESS !== "false";
const dryRun = DRY_RUN === "true";
const inspectOnly = ASQ_MODE === "inspect";
const DEBUG_DIR = join(process.cwd(), ".asq-debug");

// Selectores reales de la página de Compliance.
const SEL = {
  airport: "#airportDropDown",
  terminal: "#terminalDropDown",
  survey: "#surveyDropDown",
  period: "#periodDropDown",
  selectBtn: "#samplePlanSelectorBtn",
};

const log = (...a) => console.log(...a);
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function need(name, value) {
  if (!value) {
    console.error(`Falta variable de entorno: ${name}`);
    process.exit(1);
  }
}
need("ASQ_USERNAME", ASQ_USERNAME);
need("ASQ_PASSWORD", ASQ_PASSWORD);
if (!inspectOnly && !dryRun) need("DATABASE_URL", DATABASE_URL);

// --- Parsers ---------------------------------------------------------------

// "Regional - Summer-2026" | "Summer-2026" -> { seasonLabel, season, year }
function parseSeason(raw) {
  const seasonLabel = raw.replace(/^\s*Regional\s*-\s*/i, "").trim();
  const m = seasonLabel.match(/(Summer|Winter)/i);
  const season = m ? m[1].toUpperCase() : "UNKNOWN";
  const y = seasonLabel.match(/(\d{4})/);
  const year = y ? parseInt(y[1], 10) : 0;
  return { seasonLabel, season, year };
}

// "LA-SCL" -> { airlineCode:"LA", destinationCode:"SCL" }
function splitRoute(ad) {
  const clean = ad.replace(/\s+/g, "");
  const i = clean.indexOf("-");
  if (i < 0) return { airlineCode: null, destinationCode: null };
  return { airlineCode: clean.slice(0, i) || null, destinationCode: clean.slice(i + 1) || null };
}

// --- Helpers de <select> con cascada AJAX ----------------------------------

async function optionsOf(page, sel) {
  return await page.locator(`${sel} > option`).evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, text: (o.textContent || "").replace(/\s+/g, " ").trim() }))
  );
}

function real(opts) {
  return opts.filter((o) => o.value && o.value !== "0" && !/^select a value$/i.test(o.text));
}

// Espera a que un <select> dependiente se pueble por AJAX.
// Timeout corto: algunos aeropuertos (ej. ARI) no tienen terminales -> se saltan.
async function waitPopulated(page, sel, timeout = 12000) {
  await page.waitForFunction(
    (s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      return Array.from(el.options).some((o) => o.value && o.value !== "0");
    },
    sel,
    { timeout }
  );
}

// Selecciona un valor de forma DETERMINISTA: fija el value, sincroniza el widget
// bootstrap-select, y llama directamente al handler inline onchange (getTerminalList/
// getSurveyList/getPeriodList) — así la cascada AJAX corre aunque haya carreras de
// inicialización. Evita depender del gesto de selectOption sobre el select oculto.
async function choose(page, sel, value) {
  await page.evaluate(
    ({ sel, value }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.value = value;
      const $ = window.jQuery;
      if ($) {
        try {
          $(el).selectpicker("val", value);
        } catch (e) {}
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof el.onchange === "function") {
        try {
          el.onchange();
        } catch (e) {}
      }
    },
    { sel, value }
  );
}

// Selecciona en `sel` y espera a que el <select> `waitSel` se pueble (con reintentos,
// para tolerar carreras de la primera selección tras cargar la página).
async function selectAndWait(page, sel, value, waitSel, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    await choose(page, sel, value);
    try {
      await waitPopulated(page, waitSel, 8000);
      return;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(700);
    }
  }
  throw lastErr;
}

function pick(opts, regex) {
  return real(opts).find((o) => regex.test(o.text) || regex.test(o.value)) || real(opts)[0];
}

function seasonsFrom(opts) {
  let s = real(opts).filter((o) => /(Summer|Winter)[-\s]*\d{2,4}/i.test(o.text));
  if (s.some((o) => /Regional/i.test(o.text))) s = s.filter((o) => /Regional/i.test(o.text));
  if (ASQ_SEASONS !== "all") {
    const want = ASQ_SEASONS.split(",").map((x) => x.trim().toLowerCase());
    s = s.filter((o) => want.includes(parseSeason(o.text).seasonLabel.toLowerCase()));
  }
  return s;
}

// Fija aeropuerto -> terminal ALL -> survey Departures -> devuelve las temporadas.
async function setFiltersUpToSeason(page, airportValue) {
  // Vaciar los <select> dependientes: la lista de temporadas es POR AEROPUERTO, así
  // que si conserva la del aeropuerto anterior, waitPopulated pasa de inmediato y se
  // leen temporadas/valores rancios (period IDs que no existen para este aeropuerto).
  await page.evaluate(
    (sels) => sels.forEach((s) => { const el = document.querySelector(s); if (el) el.innerHTML = ""; }),
    [SEL.terminal, SEL.survey, SEL.period]
  );
  await selectAndWait(page, SEL.airport, airportValue, SEL.terminal);
  const term = pick(await optionsOf(page, SEL.terminal), /^all$/i);
  await selectAndWait(page, SEL.terminal, term.value, SEL.survey);
  const surv = pick(await optionsOf(page, SEL.survey), /depart/i);
  await selectAndWait(page, SEL.survey, surv.value, SEL.period);
  return seasonsFrom(await optionsOf(page, SEL.period));
}

async function runSelect(page, seasonValue) {
  await choose(page, SEL.period, seasonValue);
  // Borrar las tablas actuales ANTES de pedir la nueva temporada: así es imposible
  // leer datos de la temporada anterior (ASQ quita <body class="loading"> antes de
  // repintar la tabla, lo que causaba lecturas rancias / desfasadas).
  await page.evaluate(() => document.querySelectorAll("table").forEach((t) => t.remove()));
  await page.click(SEL.selectBtn);
  await page.waitForTimeout(400);
  // Esperar a que se quite el spinner…
  await page
    .waitForFunction(() => !document.body.classList.contains("loading"), { timeout: 25000 })
    .catch(() => {});
  // …y a que reaparezca al menos una fila de ruta XX-YYY (dato fresco). Si la
  // temporada está realmente vacía, expira y se registran 0 rutas.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("table tr")).some((tr) => {
          const c = tr.children[0];
          return c && /^[A-Z0-9]{2}[-–][A-Z]{3}$/i.test((c.textContent || "").replace(/\s+/g, ""));
        }),
      { timeout: 10000 }
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

// Lee el desglose Airline-Destination del Sample Plan. La página pinta varias
// tablas (Destinations, Airlines, Airline-Destination); cada fila de datos de la
// de Airline-Destination es [ruta "LA-SCL", Questionnaires Original Target,
// Collected, Completion Rate%]. Se identifican por el patrón de ruta XX-YYY, así
// que target=cells[1] y collected=cells[2] sin depender de los encabezados.
async function readSamplePlan(page) {
  return await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const routeRe = /^[A-Z0-9]{2}[-–][A-Z]{3}$/i;
    const toInt = (v) => {
      const n = parseInt((v || "").replace(/[^\d-]/g, ""), 10);
      return isNaN(n) ? 0 : n;
    };
    const seen = new Set();
    const rows = [];
    for (const tr of Array.from(document.querySelectorAll("table tr"))) {
      const cells = Array.from(tr.children).map((c) => norm(c.textContent));
      if (cells.length < 3) continue;
      const ad = cells[0].replace(/\s+/g, "").toUpperCase();
      if (!routeRe.test(ad) || seen.has(ad)) continue;
      seen.add(ad);
      rows.push({ airlineDestination: ad, target: toInt(cells[1]), collected: toInt(cells[2]) });
    }
    return { headers: [], rows };
  });
}

// --- Diagnóstico -----------------------------------------------------------

async function dump(page, name) {
  mkdirSync(DEBUG_DIR, { recursive: true });
  const base = join(DEBUG_DIR, `${nowStamp()}_${name}`);
  try {
    writeFileSync(`${base}.html`, await page.content());
    const sels = await page.locator("select").evaluateAll((els) =>
      els.map((el) => ({
        id: el.id,
        name: el.name,
        options: Array.from(el.options)
          .map((o) => ({ value: o.value, text: (o.textContent || "").replace(/\s+/g, " ").trim() }))
          .slice(0, 80),
      }))
    );
    const tables = await page.locator("table").evaluateAll((ts) =>
      ts.map((t, i) => ({
        idx: i,
        id: t.id,
        headers: Array.from(t.querySelectorAll("th")).map((th) => th.textContent.replace(/\s+/g, " ").trim()).slice(0, 25),
        rows: t.querySelectorAll("tr").length,
      }))
    );
    writeFileSync(`${base}.controls.json`, JSON.stringify({ selects: sels, tables }, null, 2));
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    log(`   · diagnóstico: ${base}.{html,controls.json,png}`);
  } catch (e) {
    log(`   · no se pudo volcar diagnóstico (${name}): ${e.message}`);
  }
}

// --- Navegación ------------------------------------------------------------

async function login(page) {
  log("→ Login en ASQ…");
  await page.goto(`${ASQ_BASE_URL}/Account/Login`, { waitUntil: "domcontentloaded" });
  await page
    .locator('input[type="text"], input[type="email"], input[name="UserName"], input[name="Username"]')
    .first()
    .fill(ASQ_USERNAME);
  await page.locator('input[type="password"]').first().fill(ASQ_PASSWORD);
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page
      .locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")')
      .first()
      .click(),
  ]);
  if (/\/Account\/Login/i.test(page.url())) {
    await dump(page, "login-failed");
    throw new Error("Login falló (seguimos en /Account/Login). Revisa credenciales.");
  }
  log(`   · login OK (${page.url()})`);
}

async function gotoCompliance(page) {
  log("→ Ir a Compliance…");
  const link = page.locator('a:has-text("Compliance"), a[href*="ompliance" i]').first();
  if (await link.count()) {
    await Promise.all([page.waitForLoadState("networkidle").catch(() => {}), link.click()]);
  } else {
    await page.goto(`${ASQ_BASE_URL}/compliance`, { waitUntil: "networkidle" }).catch(() => {});
  }
  await waitPopulated(page, SEL.airport).catch(() => {});
  await page.waitForTimeout(1500); // dejar que termine la init (bootstrap-select/jQuery)
  log(`   · en ${page.url()}`);
}

// --- Persistencia ----------------------------------------------------------

async function saveRun(pool, run) {
  const runId = randomUUID();
  const res = await pool.query(
    `INSERT INTO "AsqComplianceRun"
       (id, airport, season, "seasonLabel", year, terminal, "surveyType", period, "scrapedAt")
     VALUES ($1,$2,$3,$4,$5,'ALL','DEPARTURES','REGIONAL', now())
     ON CONFLICT (airport, "seasonLabel")
     DO UPDATE SET season = EXCLUDED.season, year = EXCLUDED.year, "scrapedAt" = now()
     RETURNING id`,
    [runId, run.airport, run.season, run.seasonLabel, run.year]
  );
  const id = res.rows[0].id;
  await pool.query(`DELETE FROM "AsqComplianceRow" WHERE "runId" = $1`, [id]);
  for (const r of run.rows) {
    const { airlineCode, destinationCode } = splitRoute(r.airlineDestination);
    await pool.query(
      `INSERT INTO "AsqComplianceRow"
         (id, "runId", "airlineDestination", "airlineCode", "destinationCode", target, collected)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), id, r.airlineDestination, airlineCode, destinationCode, r.target, r.collected]
    );
  }
  return id;
}

// --- Main ------------------------------------------------------------------

async function main() {
  // Local usa Edge (channel "msedge"); en CI (Linux) se pasa ASQ_BROWSER_CHANNEL=""
  // o "chromium" para usar el Chromium empaquetado por Playwright.
  const launchOpts = { headless };
  if (ASQ_BROWSER_CHANNEL && ASQ_BROWSER_CHANNEL !== "chromium") {
    launchOpts.channel = ASQ_BROWSER_CHANNEL;
  }
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  let pool = null;
  if (!inspectOnly && !dryRun) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("sslmode") ? { rejectUnauthorized: false } : undefined,
    });
  }

  try {
    await login(page);
    await gotoCompliance(page);

    // Aeropuertos = <option> con value de 3 letras (ARI, CJC, IQQ, PMC, …).
    let airports = real(await optionsOf(page, SEL.airport)).filter((o) => /^[A-Z]{3}$/.test(o.value));
    if (ASQ_AIRPORTS !== "all") {
      const want = ASQ_AIRPORTS.split(",").map((s) => s.trim().toUpperCase());
      airports = airports.filter((a) => want.includes(a.value.toUpperCase()));
    }
    log(`Aeropuertos: ${airports.map((a) => a.value).join(", ") || "(ninguno)"}`);

    if (airports.length === 0) {
      await dump(page, "no-airports");
      throw new Error("No hay aeropuertos en el desplegable. Revisa .asq-debug.");
    }

    if (inspectOnly) {
      // Buscar el primer aeropuerto CON datos (ARI puede no tener terminales).
      let chosen = null;
      let seasons = [];
      for (const apt of airports) {
        try {
          seasons = await setFiltersUpToSeason(page, apt.value);
          if (seasons.length) {
            chosen = apt;
            break;
          }
          log(`   · ${apt.value}: sin temporadas, probando siguiente…`);
        } catch (e) {
          log(`   · ${apt.value}: sin datos (${e.message.split("\n")[0]}), probando siguiente…`);
        }
      }
      if (!chosen) {
        await dump(page, "no-seasons");
        throw new Error("Ningún aeropuerto devolvió temporadas. Revisa .asq-debug.");
      }
      log(`Temporadas (${chosen.value}): ${seasons.map((s) => s.text).join(" | ")}`);
      await runSelect(page, seasons[0].value);
      await dump(page, "compliance-results");
      const sp = await readSamplePlan(page);
      log(`\nSample Plan (${chosen.value} / ${parseSeason(seasons[0].text).seasonLabel}): ${sp.rows.length} rutas`);
      log("Encabezados:", sp.headers.join(" | "));
      log(sp.rows.slice(0, 10));
      log("\n[inspect] Listo. Revisa .asq-debug para calibrar.");
      return;
    }

    let totalRuns = 0;
    let totalRows = 0;
    for (const apt of airports) {
      let seasons;
      try {
        seasons = await setFiltersUpToSeason(page, apt.value);
      } catch (e) {
        log(`  ⚠ ${apt.value}: no se pudieron cargar los filtros: ${e.message}`);
        await dump(page, `error_filters_${apt.value}`);
        continue;
      }
      for (const s of seasons) {
        const { seasonLabel, season, year } = parseSeason(s.text);
        try {
          await runSelect(page, s.value);
          const { rows } = await readSamplePlan(page);
          if (rows.length === 0) {
            log(`${apt.value} / ${seasonLabel}: sin datos (0 rutas), se omite`);
            continue; // no guardar temporadas vacías (sin Sample Plan)
          }
          const target = rows.reduce((a, b) => a + b.target, 0);
          const collected = rows.reduce((a, b) => a + b.collected, 0);
          log(`${apt.value} / ${seasonLabel}: ${rows.length} rutas · target ${target} · collected ${collected}`);
          if (!dryRun) await saveRun(pool, { airport: apt.value, season, seasonLabel, year, rows });
          totalRuns++;
          totalRows += rows.length;
        } catch (e) {
          log(`  ⚠ Error en ${apt.value} / ${seasonLabel}: ${e.message}`);
          await dump(page, `error_${apt.value}_${seasonLabel}`);
        }
      }
    }

    log(
      `\n${dryRun ? "[dry-run] " : ""}Listo: ${totalRuns} combinaciones, ${totalRows} filas${
        dryRun ? " (no se escribió en la BD)" : " guardadas"
      }.`
    );
  } finally {
    if (pool) await pool.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("Error en scrape-asq:", e.message);
  process.exit(1);
});
