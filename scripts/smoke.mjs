/**
 * End-to-end smoke test against a running server (dev or production build)
 * with the demo seed loaded. Signs in as each demo role, loads the pages that
 * role should reach, and checks that forbidden pages are not served.
 *
 *   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo@12345";

class Session {
  cookies = new Map();
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || /max-age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async fetch(path, init = {}) {
    let url = new URL(path, BASE);
    for (let hop = 0; hop < 8; hop++) {
      const res = await fetch(url, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: this.header() } });
      this.store(res);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location"), url);
        init = { headers: init.headers };
        continue;
      }
      return { res, url: url.pathname + url.search };
    }
    throw new Error(`Too many redirects for ${path}`);
  }
  async login(email) {
    const { res: csrfRes } = await this.fetch("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    const body = new URLSearchParams({ csrfToken, email, password: PASSWORD, callbackUrl: `${BASE}/dashboard` });
    await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (![...this.cookies.keys()].some((k) => k.includes("session-token"))) throw new Error(`Login failed for ${email}`);
  }
}

const ERROR_MARKERS = ["We couldn&#x27;t load this page", "We couldn't load this page", "Application error", "Internal Server Error"];

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

/** Load a page, following HTTP redirects and streamed `<meta refresh>` redirects (used when a
 * server component redirects after streaming started, e.g. behind loading.tsx). */
async function load(s, path) {
  let target = path;
  for (let hop = 0; hop < 5; hop++) {
    const { res, url } = await s.fetch(target);
    const html = await res.text();
    const meta = html.match(/<meta id="__next-page-redirect"[^>]*url=([^"]+)"/);
    if (!meta) return { res, url, html };
    target = meta[1].replace(/&amp;/g, "&");
  }
  throw new Error(`Too many redirects for ${path}`);
}

async function expectPage(s, path, { landsOn } = {}) {
  const { res, url, html } = await load(s, path);
  if (res.status >= 400) return fail(`${path} → HTTP ${res.status}`);
  const marker = ERROR_MARKERS.find((m) => html.includes(m));
  if (marker) return fail(`${path} rendered an error ("${marker}")`);
  if (landsOn && !url.startsWith(landsOn)) return fail(`${path} ended at ${url}, expected ${landsOn}`);
  console.log(`  ✓ ${path}${url !== path ? ` → ${url}` : ""}`);
}

async function expectBlocked(s, path) {
  const { res, url, html } = await load(s, path);
  const notFound = res.status === 404 || html.includes("This record doesn&#x27;t exist") || html.includes("doesn't exist, was archived");
  const blocked = url !== path || res.status === 403 || notFound;
  if (!blocked) return fail(`${path} should be blocked but was served`);
  console.log(`  ✓ blocked ${path} → ${res.status === 404 ? "404" : url}`);
}

async function expectApi(s, path, status) {
  const { res } = await s.fetch(path);
  if (res.status !== status) return fail(`${path} → ${res.status}, expected ${status}`);
  console.log(`  ✓ ${path} → ${status}`);
}

const OWNER_PAGES = [
  "/dashboard", "/hostels", "/hostels/map", "/hostels/floors", "/hostels/rooms", "/hostels/beds", "/hostels/new",
  "/residents", "/residents/new", "/residents/check-in", "/residents/check-out", "/residents/assignments", "/residents/requests",
  "/staff", "/staff/new", "/staff/attendance", "/staff/leave", "/staff/payroll",
  "/finance", "/finance/invoices", "/finance/invoices/new", "/finance/payments", "/finance/payments/new", "/finance/expenses",
  "/operations/maintenance", "/operations/maintenance/new", "/operations/complaints", "/operations/visitors", "/operations/announcements",
  "/reports", "/reports/occupancy", "/reports/outstanding", "/reports/profit-loss", "/reports/staff-attendance",
  "/audit-log", "/account",
  "/settings/organization", "/settings/branding", "/settings/invoices", "/settings/notifications", "/settings/roles",
  "/settings/members", "/settings/billing", "/settings/security", "/settings/hostels",
];

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  console.log("Public pages");
  const anon = new Session();
  for (const p of ["/", "/login", "/register", "/forgot-password"]) await expectPage(anon, p);
  await expectPage(anon, "/dashboard", { landsOn: "/login" });
  await expectApi(anon, "/api/hostels", 401);

  console.log("\nOwner");
  const owner = new Session();
  await owner.login("owner@demo-hostels.dev");
  for (const p of OWNER_PAGES) await expectPage(owner, p);
  // Detail pages discovered through the API
  for (const [api, prefix] of [
    ["/api/hostels", "/hostels/"],
    ["/api/rooms", "/hostels/rooms/"],
    ["/api/residents", "/residents/"],
    ["/api/staff", "/staff/"],
    ["/api/invoices", "/finance/invoices/"],
    ["/api/payments", "/finance/payments/"],
    ["/api/maintenance", "/operations/maintenance/"],
    ["/api/complaints", "/operations/complaints/"],
  ]) {
    const { res } = await owner.fetch(api);
    const json = await res.json();
    const first = (json.data?.items ?? json.data)?.[0];
    if (!first?.id) fail(`${api} returned no items`);
    else await expectPage(owner, `${prefix}${first.id}`);
  }
  const { res: payrollRes } = await owner.fetch("/api/payroll");
  const payroll = (await payrollRes.json()).data;
  const payslip = (payroll?.items ?? payroll?.records ?? [])[0];
  if (payslip?.id) await expectPage(owner, `/staff/payroll/${payslip.id}`);

  console.log("\nTenant isolation (owner of another organization)");
  const other = new Session();
  await other.login("owner@other-tenant.dev");
  const { res: hostelsRes } = await owner.fetch("/api/hostels");
  const demoHostel = (await hostelsRes.json()).data.items[0];
  const { res: residentsRes } = await owner.fetch("/api/residents");
  const demoResident = (await residentsRes.json()).data.items[0];
  await expectBlocked(other, `/hostels/${demoHostel.id}`);
  await expectBlocked(other, `/residents/${demoResident.id}`);
  await expectApi(other, `/api/hostels/${demoHostel.id}`, 404);
  await expectApi(other, `/api/residents/${demoResident.id}`, 404);
  const { res: otherList } = await other.fetch("/api/residents");
  const otherResidents = (await otherList.json()).data.items;
  if (otherResidents.some((r) => r.id === demoResident.id)) fail("other tenant can list demo residents");
  else console.log(`  ✓ other tenant lists only its own ${otherResidents.length} resident(s)`);

  console.log("\nAccountant");
  const accountant = new Session();
  await accountant.login("accounts@demo-hostels.dev");
  for (const p of ["/dashboard", "/finance", "/finance/invoices", "/finance/payments", "/finance/expenses", "/staff/payroll", "/reports/profit-loss"]) await expectPage(accountant, p);
  await expectBlocked(accountant, "/residents");
  await expectBlocked(accountant, "/settings/roles");
  await expectApi(accountant, "/api/residents", 403);

  console.log("\nHostel manager (Islamabad only)");
  const manager = new Session();
  await manager.login("islamabad.manager@demo-hostels.dev");
  for (const p of ["/dashboard", "/residents", "/hostels/map", "/operations/maintenance", "/operations/complaints"]) await expectPage(manager, p);
  const { res: mh } = await manager.fetch("/api/hostels");
  const managerHostels = (await mh.json()).data.items.map((h) => h.code);
  if (managerHostels.join() !== "ISB-BH") fail(`manager sees hostels ${managerHostels.join()}`);
  else console.log("  ✓ manager sees only ISB-BH");
  await expectBlocked(manager, "/finance/expenses");

  console.log("\nReceptionist (Rawalpindi only)");
  const reception = new Session();
  await reception.login("reception@demo-hostels.dev");
  for (const p of ["/dashboard", "/residents", "/residents/check-in", "/operations/visitors"]) await expectPage(reception, p);
  await expectBlocked(reception, "/finance/invoices");

  console.log("\nStaff (tasks only)");
  const staff = new Session();
  await staff.login("staff@demo-hostels.dev");
  await expectPage(staff, "/dashboard", { landsOn: "/tasks" });
  await expectPage(staff, "/tasks");
  await expectBlocked(staff, "/residents");

  console.log("\nResident portal");
  const resident = new Session();
  await resident.login("resident@demo-hostels.dev");
  await expectPage(resident, "/dashboard", { landsOn: "/portal" });
  for (const p of ["/portal", "/portal/room", "/portal/invoices", "/portal/payments", "/portal/complaints", "/portal/maintenance", "/portal/announcements", "/portal/requests", "/portal/profile"]) await expectPage(resident, p);
  await expectApi(resident, "/api/residents", 401);

  console.log("\nSuper admin");
  const admin = new Session();
  await admin.login("admin@hostelhub.dev");
  for (const p of ["/admin", "/admin/organizations", "/admin/users", "/admin/plans", "/admin/subscriptions", "/admin/feature-flags", "/admin/settings", "/admin/audit-log"]) await expectPage(admin, p);
  await expectApi(admin, "/api/residents", 401);

  console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ All smoke checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
