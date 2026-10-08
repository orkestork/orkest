/**
 * Copia los datos de Kliniu desde Odoo hacia una organización de ORKEST.
 *
 * - Odoo es SOLO LECTURA (ver ./client.ts): nunca se crea, modifica ni borra nada allí.
 * - Copia maestros completos + historial desde ODOO_SINCE (por defecto, últimos 12 meses).
 * - Si la organización ya existe hay que pasar --reset: se borra SOLO esa organización en ORKEST y se vuelve a copiar.
 *
 * Uso: npm run import:odoo -- [--reset]
 */
import { randomUUID } from "node:crypto";
import { odoo, readAll } from "./client";

// Migraciones y cargas masivas por la conexión de sesión (no por el transaction pooler)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
process.env.DB_POOL_MAX ??= "3";

const ORG_SLUG = "kliniu";
const ORG_NAME = "Kliniu";
const ADMIN_EMAIL = "admin@kliniu.co";
const SINCE = process.env.ODOO_SINCE ?? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const RESET = process.argv.includes("--reset");

type R = Record<string, any>;
const id = () => "c" + randomUUID().replace(/-/g, "").slice(0, 24);
const m2o = (v: unknown) => (Array.isArray(v) ? (v[0] as number) : undefined);
const m2oName = (v: unknown) => (Array.isArray(v) ? String(v[1]) : undefined);
const dt = (v: unknown) => (typeof v === "string" && v ? new Date(v.length === 10 ? v + "T00:00:00Z" : v.replace(" ", "T") + "Z") : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function main() {
  const { prisma } = await import("@/lib/core/prisma");
  const { tenantDb } = await import("@/lib/core/db");
  const { hashPassword } = await import("@/lib/core/auth");
  const { applyTemplate, ensureBaseRoles } = await import("@/lib/templates/apply");
  const { createWarehouse } = await import("@/lib/apps/stock");

  async function bulk(model: string, rows: R[]) {
    const delegate = (prisma as any)[model];
    for (let i = 0; i < rows.length; i += 1000) await delegate.createMany({ data: rows.slice(i, i + 1000) });
    if (rows.length) log(`  ${model}: ${rows.length}`);
  }

  // ───────── 0. Organización destino ─────────
  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existing) {
    if (!RESET) throw new Error(`La organización '${ORG_SLUG}' ya existe en ORKEST. Usa --reset para borrarla (solo en ORKEST) y copiar de nuevo.`);
    log(`Borrando la organización '${ORG_SLUG}' en ORKEST (Odoo no se toca)…`);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `select table_name from information_schema.columns where table_schema='public' and column_name='organizationId'`);
    let pending = tables.map((t) => t.table_name);
    for (let pass = 0; pending.length && pass < 15; pass++) {
      const next: string[] = [];
      for (const t of pending) {
        try { await prisma.$executeRawUnsafe(`delete from "${t}" where "organizationId" = $1`, existing.id); }
        catch { next.push(t); }
      }
      pending = next;
    }
    if (pending.length) throw new Error("No se pudo limpiar: " + pending.join(", "));
    await prisma.organization.delete({ where: { id: existing.id } });
  }

  log(`Leyendo Odoo (solo lectura) · historial desde ${SINCE}`);
  const [company] = await odoo<R[]>("res.company", "search_read", [[]], { fields: ["name", "vat"], limit: 1 });
  const org = await prisma.organization.create({ data: {
    slug: ORG_SLUG, name: ORG_NAME, legalName: str(company?.name), taxId: str(company?.vat), status: "ACTIVE", onboardingStep: 12,
    branding: { displayName: ORG_NAME, primaryColor: "#6f35b5" },
  } });
  const orgId = org.id;
  const ctx = { orgId, db: tenantDb(orgId), actorId: null } as any;
  await ensureBaseRoles(ctx);

  // ───────── 1. Almacenes y ubicaciones ─────────
  const order = ["WHI", "WHP", "WHE", "WHA"]; // cadena real: inyección → piezas → ensamble → almacén
  const whs = (await readAll<R>("stock.warehouse", [["active", "=", true]], ["code", "name", "lot_stock_id"]))
    .sort((a, b) => (order.indexOf(a.code) + 99) % 99 - (order.indexOf(b.code) + 99) % 99);
  const whMap = new Map<number, { id: string; stock: string }>();
  const locMap = new Map<number, string>();
  for (const w of whs) {
    const wh = await createWarehouse(ctx, { code: w.code, name: w.name });
    whMap.set(w.id, { id: wh.id, stock: wh.stockLocationId! });
    locMap.set(m2o(w.lot_stock_id)!, wh.stockLocationId!);
  }
  const mainWh = [...whMap.values()].at(-1)!; // ALMACEN
  log(`  almacenes: ${whs.map((w) => w.code).join(" → ")}`);

  const quants = await readAll<R>("stock.quant", [["location_id.usage", "=", "internal"]], ["product_id", "location_id", "quantity"]);
  const usedLocs = new Set(quants.map((q) => m2o(q.location_id)!));
  const odooLocs = await readAll<R>("stock.location", [["usage", "=", "internal"]], ["complete_name", "warehouse_id", "active"]);
  const newLocs: R[] = [];
  for (const l of odooLocs) {
    if (locMap.has(l.id) || !(l.active || usedLocs.has(l.id))) continue;
    const lid = id();
    locMap.set(l.id, lid);
    newLocs.push({ id: lid, organizationId: orgId, warehouseId: whMap.get(m2o(l.warehouse_id)!)?.id ?? null, name: l.complete_name, kind: "INTERNAL", active: !!l.active || usedLocs.has(l.id) });
  }
  await bulk("location", newLocs);

  // ───────── 2. Contabilidad base: diarios, impuestos, plazos, listas de precios ─────────
  const journals = await readAll<R>("account.journal", [], ["code", "name", "type", "active"]);
  const jType: R = { sale: "SALE", purchase: "PURCHASE", bank: "BANK", cash: "CASH" };
  const journalMap = new Map<number, string>();
  await bulk("journal", journals.map((j) => { const jid = id(); journalMap.set(j.id, jid); return { id: jid, organizationId: orgId, code: j.code, name: j.name, type: jType[j.type] ?? "GENERAL", active: j.active !== false }; }));

  const taxes = await readAll<R>("account.tax", [], ["name", "amount", "amount_type", "type_tax_use", "active"]);
  const taxRate = new Map<number, number>(taxes.filter((t) => t.amount_type === "percent").map((t) => [t.id, n(t.amount)]));
  const rateOf = (ids: unknown) => Math.max(0, ...((Array.isArray(ids) ? ids : []) as number[]).map((t) => taxRate.get(t) ?? 0));
  await bulk("tax", taxes.filter((t) => t.amount_type === "percent" && ["sale", "purchase"].includes(t.type_tax_use))
    .map((t) => ({ id: id(), organizationId: orgId, name: t.name, rate: n(t.amount), scope: t.type_tax_use === "sale" ? "SALE" : "PURCHASE", active: t.active !== false })));

  const terms = await readAll<R>("account.payment.term", [], ["name"]);
  const termLines = await readAll<R>("account.payment.term.line", [], ["payment_id", "value", "value_amount", "nb_days"]);
  const termMap = new Map<number, string>();
  await bulk("paymentTerm", terms.map((t) => {
    const tid = id(); termMap.set(t.id, tid);
    const lines = termLines.filter((l) => m2o(l.payment_id) === t.id && l.value === "percent").map((l) => ({ percent: n(l.value_amount), days: n(l.nb_days) }));
    return { id: tid, organizationId: orgId, name: t.name, lines: lines.length ? lines : [{ percent: 100, days: 0 }], isDefault: false };
  }));

  const pricelists = await readAll<R>("product.pricelist", [], ["name", "currency_id"]);
  const plMap = new Map<number, string>();
  await bulk("pricelist", pricelists.map((p, i) => { const pid = id(); plMap.set(p.id, pid); return { id: pid, organizationId: orgId, name: p.name, currency: m2oName(p.currency_id) ?? "COP", isDefault: i === 0 }; }));

  // ───────── 3. Productos ─────────
  const UNIT: R = { Units: "UND", Dozens: "DOC", kg: "KG", g: "G", L: "L", m: "M", ml: "ML", cm: "CM", mm: "MM", t: "T", lb: "LB" };
  const prods = await readAll<R>("product.product", [], ["default_code", "name", "categ_id", "uom_id", "list_price", "standard_price", "type", "sale_ok", "purchase_ok", "taxes_id", "active", "product_tmpl_id"]);
  const prodMap = new Map<number, string>();
  const tmplToProd = new Map<number, string>();
  const skus = new Set<string>();
  const stockBy = new Map<number, number>();
  const quantAgg = new Map<string, { productId: string; locationId: string; quantity: number }>();
  for (const p of prods) { const pid = id(); prodMap.set(p.id, pid); if (!tmplToProd.has(m2o(p.product_tmpl_id)!)) tmplToProd.set(m2o(p.product_tmpl_id)!, pid); }
  for (const q of quants) {
    const pid = prodMap.get(m2o(q.product_id)!), lid = locMap.get(m2o(q.location_id)!);
    if (!pid || !lid) continue;
    const k = pid + lid;
    const cur = quantAgg.get(k) ?? { productId: pid, locationId: lid, quantity: 0 };
    cur.quantity += n(q.quantity); quantAgg.set(k, cur);
    stockBy.set(m2o(q.product_id)!, (stockBy.get(m2o(q.product_id)!) ?? 0) + n(q.quantity));
  }

  // Proveedores habituales (product.supplierinfo) → proveedor por defecto
  const sellers = await readAll<R>("product.supplierinfo", [], ["partner_id", "product_tmpl_id", "product_id", "sequence"]);

  // ───────── 4. Terceros: clientes, proveedores, contactos ─────────
  const sos = await readAll<R>("sale.order", [["date_order", ">=", SINCE], ["state", "in", ["sale", "done", "cancel"]]],
    ["name", "partner_id", "date_order", "state", "amount_untaxed", "amount_tax", "amount_total", "warehouse_id", "pricelist_id", "payment_term_id", "invoice_status", "delivery_status", "commitment_date", "currency_id"]);
  const pos = await readAll<R>("purchase.order", [["date_order", ">=", SINCE]],
    ["name", "partner_id", "picking_type_id", "origin", "state", "receipt_status", "invoice_status", "amount_untaxed", "amount_tax", "amount_total", "date_planned", "date_approve", "date_order", "currency_id", "note"]);
  const moves = await readAll<R>("account.move", [["move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]], ["invoice_date", ">=", SINCE], ["state", "!=", "draft"]],
    ["name", "ref", "partner_id", "move_type", "invoice_date", "invoice_date_due", "amount_untaxed", "amount_tax", "amount_total", "amount_residual", "state", "payment_state", "invoice_origin", "reversed_entry_id", "invoice_payment_term_id"]);

  const custRefs = new Set<number>([...sos.map((s) => m2o(s.partner_id)!), ...moves.filter((m) => m.move_type.startsWith("out")).map((m) => m2o(m.partner_id)!)].filter(Boolean));
  const suppRefs = new Set<number>([...pos.map((p) => m2o(p.partner_id)!), ...moves.filter((m) => m.move_type.startsWith("in")).map((m) => m2o(m.partner_id)!), ...sellers.map((s) => m2o(s.partner_id)!)].filter(Boolean));
  const pFields = ["name", "vat", "email", "phone", "city", "parent_id", "commercial_partner_id", "property_product_pricelist", "property_payment_term_id", "active", "function", "customer_rank", "supplier_rank"];
  const partners = new Map<number, R>();
  const loadPartners = async (domain: unknown[]) => { for (const p of await readAll<R>("res.partner", domain, pFields)) partners.set(p.id, p); };
  await loadPartners(["|", "|", ["customer_rank", ">", 0], ["supplier_rank", ">", 0], ["id", "in", [...custRefs, ...suppRefs]]]);
  const missingCommercial = [...partners.values()].map((p) => m2o(p.commercial_partner_id)!).filter((c) => c && !partners.has(c));
  if (missingCommercial.length) await loadPartners([["id", "in", [...new Set(missingCommercial)]]]);
  const commercial = (pid?: number) => (pid ? m2o(partners.get(pid)?.commercial_partner_id) ?? pid : undefined);

  const isCustomer = new Set<number>(), isSupplier = new Set<number>();
  for (const p of partners.values()) {
    const c = commercial(p.id)!;
    if (p.customer_rank > 0 || custRefs.has(p.id)) isCustomer.add(c);
    if (p.supplier_rank > 0 || suppRefs.has(p.id)) isSupplier.add(c);
  }
  const custMap = new Map<number, string>(), suppMap = new Map<number, string>();
  await bulk("customer", [...isCustomer].map((pid) => {
    const p = partners.get(pid)!; const cid = id(); custMap.set(pid, cid);
    return { id: cid, organizationId: orgId, name: str(p.name) ?? `Cliente ${pid}`, taxId: str(p.vat), email: str(p.email), phone: str(p.phone), city: str(p.city),
      status: p.active === false ? "INACTIVE" : "ACTIVE", pricelistId: plMap.get(m2o(p.property_product_pricelist)!) ?? null, paymentTermId: termMap.get(m2o(p.property_payment_term_id)!) ?? null };
  }));
  await bulk("supplier", [...isSupplier].map((pid) => {
    const p = partners.get(pid)!; const sid = id(); suppMap.set(pid, sid);
    return { id: sid, organizationId: orgId, name: str(p.name) ?? `Proveedor ${pid}`, taxId: str(p.vat), email: str(p.email), phone: str(p.phone), paymentTermId: termMap.get(m2o(p.property_payment_term_id)!) ?? null };
  }));
  await bulk("contact", [...partners.values()].filter((p) => commercial(p.id) !== p.id && custMap.has(commercial(p.id)!))
    .map((p) => ({ id: id(), organizationId: orgId, customerId: custMap.get(commercial(p.id)!)!, name: str(p.name) ?? "Contacto", email: str(p.email), phone: str(p.phone), position: str(p.function) })));
  const custOf = (pid: unknown) => custMap.get(commercial(m2o(pid))!);
  const suppOf = (pid: unknown) => suppMap.get(commercial(m2o(pid))!);

  // Productos (ya con proveedor por defecto)
  const defaultSupp = new Map<number, string>();
  for (const s of [...sellers].sort((a, b) => n(a.sequence) - n(b.sequence))) {
    const tmpl = m2o(s.product_tmpl_id)!, sid = suppOf(s.partner_id);
    if (sid && !defaultSupp.has(tmpl)) defaultSupp.set(tmpl, sid);
  }
  const orderpoints = await readAll<R>("stock.warehouse.orderpoint", [], ["product_id", "location_id", "warehouse_id", "product_min_qty", "product_max_qty", "trigger", "route_id", "active"]);
  const minBy = new Map<number, number>(orderpoints.filter((o) => o.active).map((o) => [m2o(o.product_id)!, n(o.product_min_qty)]));
  await bulk("product", prods.map((p) => {
    let sku = str(p.default_code) ?? `ODOO-${p.id}`;
    if (skus.has(sku)) sku = `${sku}-${p.id}`;
    skus.add(sku);
    const uom = m2oName(p.uom_id) ?? "Units";
    return { id: prodMap.get(p.id)!, organizationId: orgId, sku, name: str(p.name) ?? sku, category: m2oName(p.categ_id) ?? null, unit: UNIT[uom] ?? uom.toUpperCase(),
      price: n(p.list_price), cost: n(p.standard_price), stock: stockBy.get(p.id) ?? 0, minStock: minBy.get(p.id) ?? 0,
      kind: p.type === "service" ? "SERVICE" : p.type === "combo" ? "COMBO" : "GOODS", taxRate: rateOf(p.taxes_id),
      canBeSold: !!p.sale_ok, canBePurchased: !!p.purchase_ok, defaultSupplierId: defaultSupp.get(m2o(p.product_tmpl_id)!) ?? null, active: p.active !== false };
  }));
  await bulk("stockQuant", [...quantAgg.values()].map((q) => ({ id: id(), organizationId: orgId, ...q })));

  const items = await readAll<R>("product.pricelist.item", [], ["pricelist_id", "applied_on", "product_id", "product_tmpl_id", "categ_id", "min_quantity", "compute_price", "fixed_price", "percent_price"]);
  await bulk("pricelistItem", items.filter((it) => plMap.has(m2o(it.pricelist_id)!) && ["fixed", "percentage"].includes(it.compute_price)).map((it) => ({
    id: id(), pricelistId: plMap.get(m2o(it.pricelist_id)!)!,
    productId: it.applied_on === "0_product_variant" ? prodMap.get(m2o(it.product_id)!) ?? null : it.applied_on === "1_product" ? tmplToProd.get(m2o(it.product_tmpl_id)!) ?? null : null,
    category: it.applied_on === "2_product_category" ? m2oName(it.categ_id) ?? null : null, minQty: n(it.min_quantity),
    fixedPrice: it.compute_price === "fixed" ? n(it.fixed_price) : null, discountPct: it.compute_price === "percentage" ? n(it.percent_price) : null,
  })));

  // ───────── 5. Manufactura: centros, listas de materiales, reglas ─────────
  const wcs = await readAll<R>("mrp.workcenter", [], ["code", "name", "costs_hour", "active"]);
  const wcMap = new Map<number, string>();
  await bulk("workCenter", wcs.map((w) => { const wid = id(); wcMap.set(w.id, wid); return { id: wid, organizationId: orgId, code: str(w.code) ?? `CT${w.id}`, name: w.name, costPerHour: n(w.costs_hour), active: w.active !== false }; }));

  const boms = await readAll<R>("mrp.bom", [], ["product_id", "product_tmpl_id", "code", "type", "product_qty", "active"]);
  const bomLines = await readAll<R>("mrp.bom.line", [], ["bom_id", "product_id", "product_qty"]);
  const bomOps = await readAll<R>("mrp.routing.workcenter", [], ["bom_id", "workcenter_id", "name", "time_cycle_manual", "sequence"]);
  const bomMap = new Map<number, string>();
  const bomProducts = new Set<string>();
  await bulk("bom", boms.flatMap((b) => {
    const pid = prodMap.get(m2o(b.product_id)!) ?? tmplToProd.get(m2o(b.product_tmpl_id)!);
    if (!pid) return [];
    const bid = id(); bomMap.set(b.id, bid); bomProducts.add(pid);
    return [{ id: bid, organizationId: orgId, productId: pid, code: str(b.code), type: b.type === "phantom" ? "KIT" : "NORMAL", quantity: n(b.product_qty) || 1, active: b.active !== false }];
  }));
  await bulk("bomLine", bomLines.filter((l) => bomMap.has(m2o(l.bom_id)!) && prodMap.has(m2o(l.product_id)!))
    .map((l) => ({ id: id(), bomId: bomMap.get(m2o(l.bom_id)!)!, componentId: prodMap.get(m2o(l.product_id)!)!, quantity: n(l.product_qty) })));
  await bulk("bomOperation", bomOps.filter((o) => bomMap.has(m2o(o.bom_id)!) && wcMap.has(m2o(o.workcenter_id)!))
    .map((o) => ({ id: id(), bomId: bomMap.get(m2o(o.bom_id)!)!, workCenterId: wcMap.get(m2o(o.workcenter_id)!)!, name: o.name, durationMinutes: Math.round(n(o.time_cycle_manual)) || 60, position: n(o.sequence) })));

  const routes = new Map((await readAll<R>("stock.route", [], ["name"])).map((r) => [r.id, String(r.name)]));
  const ruleKeys = new Set<string>();
  await bulk("reorderRule", orderpoints.flatMap((o) => {
    const pid = prodMap.get(m2o(o.product_id)!);
    const lid = locMap.get(m2o(o.location_id)!) ?? whMap.get(m2o(o.warehouse_id)!)?.stock;
    if (!pid || !lid || ruleKeys.has(pid + lid)) return [];
    ruleKeys.add(pid + lid);
    const route = routes.get(m2o(o.route_id)!) ?? "";
    const action = /manufact|fabric/i.test(route) ? "MANUFACTURE" : /buy|compra/i.test(route) ? "BUY" : bomProducts.has(pid) ? "MANUFACTURE" : "BUY";
    return [{ id: id(), organizationId: orgId, productId: pid, locationId: lid, minQty: n(o.product_min_qty), maxQty: n(o.product_max_qty),
      trigger: o.trigger === "auto" ? "AUTO" : "MANUAL", action, active: o.active !== false }];
  }));

  // ───────── 6. Ventas ─────────
  const pickTypes = new Map((await readAll<R>("stock.picking.type", [], ["warehouse_id"])).map((t) => [t.id, m2o(t.warehouse_id)]));
  const whOf = (odooWh?: number) => whMap.get(odooWh!) ?? mainWh;
  const soMap = new Map<number, string>(), soByName = new Map<string, string>();
  const DELIV: R = { partial: "partial", started: "partial", full: "full" };
  const INV: R = { "to invoice": "to_invoice", invoiced: "invoiced", upselling: "invoiced" };
  const soRows = sos.flatMap((s) => {
    const cid = custOf(s.partner_id); if (!cid) return [];
    const sid = id(); soMap.set(s.id, sid); soByName.set(s.name, sid);
    const delivery = DELIV[s.delivery_status] ?? "none";
    return [{ id: sid, organizationId: orgId, number: s.name, customerId: cid, warehouseId: whOf(s.warehouse_id && m2o(s.warehouse_id)).id,
      pricelistId: plMap.get(m2o(s.pricelist_id)!) ?? null, paymentTermId: termMap.get(m2o(s.payment_term_id)!) ?? null,
      status: s.state === "cancel" ? "canceled" : delivery === "full" && s.invoice_status !== "to invoice" ? "done" : "confirmed",
      deliveryStatus: delivery, invoiceStatus: INV[s.invoice_status] ?? "none", currency: m2oName(s.currency_id) ?? "COP",
      subtotal: n(s.amount_untaxed), tax: n(s.amount_tax), total: n(s.amount_total), commitmentAt: dt(s.commitment_date) ?? null, createdAt: dt(s.date_order) }];
  });
  await bulk("salesOrder", soRows);
  const soLineFields = ["order_id", "product_id", "name", "product_uom_qty", "price_unit", "discount", "tax_ids", "price_subtotal", "qty_delivered", "qty_invoiced"];
  const soLines = await readAll<R>("sale.order.line", [["order_id.date_order", ">=", SINCE], ["display_type", "=", false]], soLineFields);
  const solMap = new Map<number, string>();
  await bulk("salesOrderLine", soLines.filter((l) => soMap.has(m2o(l.order_id)!)).map((l) => {
    const lid = id(); solMap.set(l.id, lid);
    return { id: lid, salesOrderId: soMap.get(m2o(l.order_id)!)!, productId: prodMap.get(m2o(l.product_id)!) ?? null, description: str(l.name) ?? "-",
      quantity: n(l.product_uom_qty), unitPrice: n(l.price_unit), discountPct: n(l.discount), taxRate: rateOf(l.tax_ids), total: n(l.price_subtotal),
      deliveredQty: n(l.qty_delivered), invoicedQty: n(l.qty_invoiced) };
  }));

  // ───────── 7. Compras ─────────
  const poMap = new Map<number, string>(), poByName = new Map<string, string>();
  const POST: R = { draft: "draft", sent: "sent", "to approve": "to_approve", purchase: "purchase", done: "received", cancel: "canceled" };
  await bulk("purchaseOrder", pos.flatMap((p) => {
    const sid = suppOf(p.partner_id); if (!sid) return [];
    const pid = id(); poMap.set(p.id, pid); poByName.set(p.name, pid);
    const receipt = p.receipt_status === "full" ? "full" : p.receipt_status === "partial" ? "partial" : "none";
    return [{ id: pid, organizationId: orgId, number: p.name, supplierId: sid, warehouseId: whOf(pickTypes.get(m2o(p.picking_type_id)!)).id, origin: str(p.origin),
      status: p.state === "purchase" && receipt === "full" ? "received" : POST[p.state] ?? "draft", receiptStatus: receipt, billStatus: p.invoice_status === "invoiced" ? "billed" : "none",
      currency: m2oName(p.currency_id) ?? "COP", subtotal: n(p.amount_untaxed), tax: n(p.amount_tax), total: n(p.amount_total),
      expectedAt: dt(p.date_planned) ?? null, confirmedAt: dt(p.date_approve) ?? null, notes: str(typeof p.note === "string" ? p.note.replace(/<[^>]+>/g, " ") : null), createdAt: dt(p.date_order) }];
  }));
  const polFields = Object.keys(await odoo<R>("purchase.order.line", "fields_get", [], { attributes: ["type"] }));
  const polTax = polFields.includes("tax_ids") ? "tax_ids" : "taxes_id";
  const poLines = await readAll<R>("purchase.order.line", [["order_id.date_order", ">=", SINCE], ["display_type", "=", false]],
    ["order_id", "product_id", "name", "product_qty", "price_unit", polTax, "price_subtotal", "qty_received", "qty_invoiced"]);
  const polMap = new Map<number, string>();
  await bulk("purchaseOrderLine", poLines.filter((l) => poMap.has(m2o(l.order_id)!)).map((l) => {
    const lid = id(); polMap.set(l.id, lid);
    return { id: lid, purchaseOrderId: poMap.get(m2o(l.order_id)!)!, productId: prodMap.get(m2o(l.product_id)!) ?? null, description: str(l.name) ?? "-",
      quantity: n(l.product_qty), unitPrice: n(l.price_unit), taxRate: rateOf(l[polTax]), total: n(l.price_subtotal), receivedQty: n(l.qty_received), billedQty: n(l.qty_invoiced) };
  }));

  // ───────── 8. Facturación y pagos ─────────
  const usedNumbers = new Set<string>();
  const uniqueNumber = (name: unknown, oid: number, prefix: string) => {
    let num = str(name) && name !== "/" ? String(name).trim() : `${prefix}-${oid}`;
    if (usedNumbers.has(num)) num = `${num} #${oid}`;
    usedNumbers.add(num); return num;
  };
  const invMap = new Map<number, string>(), billMap = new Map<number, string>();
  const statusOf = (m: R) => (m.state === "cancel" ? "void" : ["paid", "in_payment", "reversed"].includes(m.payment_state) ? "paid" : null);
  const outMoves = moves.filter((m) => m.move_type.startsWith("out") && custOf(m.partner_id));
  const inMoves = moves.filter((m) => m.move_type.startsWith("in") && suppOf(m.partner_id));
  outMoves.forEach((m) => invMap.set(m.id, id()));
  inMoves.forEach((m) => billMap.set(m.id, id()));
  await bulk("invoice", outMoves.map((m) => ({
    id: invMap.get(m.id)!, organizationId: orgId, number: uniqueNumber(m.name, m.id, "FV"), customerId: custOf(m.partner_id)!,
    salesOrderId: soByName.get(String(m.invoice_origin ?? "").split(",")[0].trim()) ?? null, type: m.move_type === "out_refund" ? "OUT_REFUND" : "OUT_INVOICE",
    refundOfId: invMap.get(m2o(m.reversed_entry_id)!) ?? null, paymentTermId: termMap.get(m2o(m.invoice_payment_term_id)!) ?? null,
    subtotal: n(m.amount_untaxed), tax: n(m.amount_tax), total: n(m.amount_total), balance: n(m.amount_residual),
    issuedAt: dt(m.invoice_date)!, dueDate: dt(m.invoice_date_due) ?? dt(m.invoice_date)!, status: statusOf(m) ?? "issued",
  })));
  usedNumbers.clear();
  await bulk("bill", inMoves.map((m) => ({
    id: billMap.get(m.id)!, organizationId: orgId, number: uniqueNumber(m.name, m.id, "FP"), supplierRef: str(m.ref), supplierId: suppOf(m.partner_id)!,
    purchaseOrderId: poByName.get(String(m.invoice_origin ?? "").split(",")[0].trim()) ?? null,
    subtotal: n(m.amount_untaxed), tax: n(m.amount_tax), total: n(m.amount_total), balance: n(m.amount_residual),
    issuedAt: dt(m.invoice_date)!, dueDate: dt(m.invoice_date_due) ?? dt(m.invoice_date)!, status: statusOf(m) ?? "posted",
  })));
  const amlFields = Object.keys(await odoo<R>("account.move.line", "fields_get", [], { attributes: ["type"] }));
  const amlLinks = ["sale_line_ids", "purchase_line_id"].filter((f) => amlFields.includes(f));
  const amls = invMap.size + billMap.size === 0 ? [] : await readAll<R>("account.move.line",
    [["move_id", "in", [...invMap.keys(), ...billMap.keys()]], ["display_type", "=", "product"]],
    ["move_id", "product_id", "name", "quantity", "price_unit", "tax_ids", "price_subtotal", ...amlLinks]);
  await bulk("invoiceLine", amls.filter((l) => invMap.has(m2o(l.move_id)!)).map((l) => ({
    id: id(), invoiceId: invMap.get(m2o(l.move_id)!)!, productId: prodMap.get(m2o(l.product_id)!) ?? null, salesOrderLineId: solMap.get((l.sale_line_ids ?? [])[0]) ?? null,
    description: str(l.name) ?? "-", quantity: n(l.quantity), unitPrice: n(l.price_unit), taxRate: rateOf(l.tax_ids), subtotal: n(l.price_subtotal),
  })));
  await bulk("billLine", amls.filter((l) => billMap.has(m2o(l.move_id)!)).map((l) => ({
    id: id(), billId: billMap.get(m2o(l.move_id)!)!, productId: prodMap.get(m2o(l.product_id)!) ?? null, purchaseOrderLineId: polMap.get(m2o(l.purchase_line_id)!) ?? null,
    description: str(l.name) ?? "-", quantity: n(l.quantity), unitPrice: n(l.price_unit), taxRate: rateOf(l.tax_ids), subtotal: n(l.price_subtotal),
  })));

  const pays = await readAll<R>("account.payment", [["date", ">=", SINCE], ["state", "not in", ["draft", "canceled", "cancel", "rejected"]]],
    ["name", "payment_type", "journal_id", "partner_id", "amount", "date", "memo", "reconciled_invoice_ids", "reconciled_bill_ids"]);
  usedNumbers.clear();
  const payRows = pays.filter((p) => journalMap.has(m2o(p.journal_id)!)).map((p) => ({
    id: id(), organizationId: orgId, number: uniqueNumber(p.name, p.id, "PAG"), direction: p.payment_type === "outbound" ? "OUTBOUND" : "INBOUND",
    journalId: journalMap.get(m2o(p.journal_id)!)!, invoiceId: invMap.get((p.reconciled_invoice_ids ?? [])[0]) ?? null, billId: billMap.get((p.reconciled_bill_ids ?? [])[0]) ?? null,
    partnerName: m2oName(p.partner_id) ?? "-", amount: n(p.amount), date: dt(p.date)!, reference: str(p.memo),
  }));
  await bulk("payment", payRows);
  // Fecha de pago de facturas pagadas = último pago conciliado
  for (const p of payRows) {
    if (p.invoiceId) await prisma.invoice.updateMany({ where: { id: p.invoiceId, status: "paid" }, data: { paidAt: p.date } });
    if (p.billId) await prisma.bill.updateMany({ where: { id: p.billId, status: "paid" }, data: { paidAt: p.date } });
  }

  // ───────── 9. Órdenes de producción ─────────
  const mos = await readAll<R>("mrp.production", [["date_start", ">=", SINCE]],
    ["name", "product_id", "bom_id", "product_qty", "qty_produced", "state", "picking_type_id", "location_src_id", "location_dest_id", "origin", "date_start", "date_finished"]);
  const MOST: R = { draft: "draft", confirmed: "confirmed", progress: "in_progress", to_close: "in_progress", done: "done", cancel: "canceled" };
  const moMap = new Map<number, string>();
  usedNumbers.clear();
  await bulk("productionOrder", mos.flatMap((m) => {
    const pid = prodMap.get(m2o(m.product_id)!); if (!pid) return [];
    const wh = whOf(pickTypes.get(m2o(m.picking_type_id)!));
    const mid = id(); moMap.set(m.id, mid);
    return [{ id: mid, organizationId: orgId, number: uniqueNumber(m.name, m.id, "OP"), productId: pid, bomId: bomMap.get(m2o(m.bom_id)!) ?? null,
      quantity: n(m.product_qty), producedQty: n(m.qty_produced), status: MOST[m.state] ?? "draft", warehouseId: wh.id,
      srcLocationId: locMap.get(m2o(m.location_src_id)!) ?? wh.stock, destLocationId: locMap.get(m2o(m.location_dest_id)!) ?? wh.stock, origin: str(m.origin),
      scheduledAt: dt(m.date_start)!, startedAt: m.state === "draft" ? null : dt(m.date_start) ?? null, doneAt: m.state === "done" ? dt(m.date_finished) ?? null : null, createdAt: dt(m.date_start) }];
  }));
  const raw = await readAll<R>("stock.move", [["raw_material_production_id.date_start", ">=", SINCE]], ["raw_material_production_id", "product_id", "product_uom_qty", "quantity", "state"]);
  await bulk("productionComponent", raw.filter((r) => moMap.has(m2o(r.raw_material_production_id)!) && prodMap.has(m2o(r.product_id)!)).map((r) => ({
    id: id(), productionId: moMap.get(m2o(r.raw_material_production_id)!)!, productId: prodMap.get(m2o(r.product_id)!)!,
    required: n(r.product_uom_qty), consumed: r.state === "done" ? n(r.quantity) : 0,
  })));

  // ───────── 10. Plantilla (apps, roles, flujos) y acceso ─────────
  await applyTemplate(ctx, "manufacturing");
  const owner = await prisma.role.findFirstOrThrow({ where: { organizationId: orgId, key: "OWNER" } });
  const user = (await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))
    ?? (await prisma.user.create({ data: { email: ADMIN_EMAIL, name: "Administrador Kliniu", passwordHash: await hashPassword("orkest123") } }));
  await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, roleId: owner.id, title: "Administrador" } });
  if (await prisma.plan.findUnique({ where: { key: "growth" } })) await prisma.subscription.create({ data: { organizationId: orgId, planKey: "growth", status: "TRIAL" } });

  // ───────── 11. Verificación contra Odoo ─────────
  const sum = async (model: string, field: string) => Number((await (prisma as any)[model].aggregate({ where: { organizationId: orgId }, _sum: { [field]: true } }))._sum[field] ?? 0);
  const checks: [string, number, number][] = [
    ["Productos", prods.length, await prisma.product.count({ where: { organizationId: orgId } })],
    ["Pedidos de venta", sos.filter((s) => custOf(s.partner_id)).length, await prisma.salesOrder.count({ where: { organizationId: orgId } })],
    ["Total ventas", Math.round(sos.filter((s) => s.state !== "cancel").reduce((a, s) => a + n(s.amount_total), 0)), Math.round(Number((await prisma.salesOrder.aggregate({ where: { organizationId: orgId, status: { not: "canceled" } }, _sum: { total: true } }))._sum.total ?? 0))],
    ["Órdenes de compra", pos.length, await prisma.purchaseOrder.count({ where: { organizationId: orgId } })],
    ["Facturas cliente", outMoves.length, await prisma.invoice.count({ where: { organizationId: orgId } })],
    ["Órdenes de producción", mos.length, await prisma.productionOrder.count({ where: { organizationId: orgId } })],
    ["Listas de materiales", boms.length, await prisma.bom.count({ where: { organizationId: orgId } })],
    ["Existencias (suma)", Math.round(quants.filter((q) => locMap.has(m2o(q.location_id)!)).reduce((a, q) => a + n(q.quantity), 0)), Math.round(await sum("stockQuant", "quantity"))],
  ];
  console.log("\nVerificación Odoo → ORKEST");
  for (const [label, a, b] of checks) console.log(`  ${a === b ? "✔" : "✖"} ${label.padEnd(24)} Odoo ${a.toLocaleString("es-CO").padStart(14)}   ORKEST ${b.toLocaleString("es-CO").padStart(14)}`);
  console.log(`\n✔ Copia lista. Entra con ${ADMIN_EMAIL} / orkest123`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("✖", e instanceof Error ? e.message : e); process.exit(1); });
