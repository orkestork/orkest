import "dotenv/config";
import { prisma } from "@/lib/core/prisma";
import { tenantDb } from "@/lib/core/db";
import type { ExecContext } from "@/lib/core/context";
import { hashPassword } from "@/lib/core/auth";
import { applyTemplate, ensureBaseRoles } from "@/lib/templates/apply";
import { createCustomer, createOpportunity } from "@/lib/apps/crm";
import { createProduct } from "@/lib/apps/inventory";
import { createQuote } from "@/lib/apps/sales";
import type { OrgContext } from "@/lib/core/context";
import { nextNumber } from "@/lib/core/db";
import { addActivity } from "@/lib/core/notify";
import { executeTransition, getWorkflow } from "@/lib/core/workflow";
import { decideApproval } from "@/lib/core/approvals";
import { adjustStock, createWarehouse, validateTransfer } from "@/lib/apps/stock";
import { runReplenishment } from "@/lib/apps/replenishment";
import { createPurchaseOrder, createRequisition, rfqFromRequisition } from "@/lib/apps/purchasing";
import { createBom, createProduction, produce, workOrderAction } from "@/lib/apps/manufacturing";
import { createSalesOrder, priceFor } from "@/lib/apps/sales-orders";
import { billFromPurchaseOrder, invoiceFromSalesOrder, registerPayment } from "@/lib/apps/invoicing";
import { createCustomEntity, createRecord } from "@/lib/apps/custom-objects";
import { seedHistory } from "./history";
import { createNonconformity } from "@/lib/apps/quality";
import { createKnowledge, link, publishKnowledge } from "@/lib/apps/knowledge";
import { addSonarItem } from "@/lib/apps/sonar";
import { runRadar } from "@/lib/radar/engine";

/**
 * Seed de demostración. PRESSERVAC es SOLO DATOS Y CONFIGURACIÓN:
 * no existe ninguna línea de código de la aplicación que lo mencione.
 */
const PASSWORD = "orkest123";
const DAY = 86400000;

async function reset() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%'`,
  );
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function user(email: string, name: string, isPlatformAdmin = false) {
  return prisma.user.create({ data: { email, name, passwordHash: await hashPassword(PASSWORD), isPlatformAdmin } });
}

async function member(ctx: ExecContext, userId: string, roleKey: string, title?: string) {
  const role = await ctx.db.role.findFirstOrThrow({ where: { key: roleKey } });
  await ctx.db.membership.create({ data: { organizationId: ctx.orgId, userId, roleId: role.id, title } });
}

async function org(slug: string, name: string, extra: object) {
  const o = await prisma.organization.create({ data: { slug, name, status: "ACTIVE", onboardingStep: 11, ...extra } });
  return { orgId: o.id, db: tenantDb(o.id), actorId: null } as ExecContext;
}

async function main() {
  await reset();

  // ── Plataforma OR-K ──
  await prisma.plan.createMany({
    data: [
      { key: "starter", name: "Starter", priceMonthly: 290000, modules: ["crm", "sales", "products", "invoicing"], limits: { users: 5, storageMb: 2048 } },
      { key: "growth", name: "Growth", priceMonthly: 890000, modules: ["crm", "sales", "products", "inventory", "purchasing", "invoicing", "knowledge", "radar", "analytics", "automations"], limits: { users: 25, storageMb: 20480 } },
      { key: "enterprise", name: "Enterprise", priceMonthly: 0, modules: ["*"], limits: { users: 1000, storageMb: 512000 } },
    ],
  });
  await prisma.featureFlag.createMany({
    data: [
      { key: "intelligence.ask", description: "Ask ORKEST (asistente de consultas)", defaultEnabled: true },
      { key: "studio.workflow_editor", description: "Editor de workflows en Studio", defaultEnabled: true },
      { key: "import.xlsx", description: "Importación desde Excel (.xlsx)", defaultEnabled: true },
      { key: "intelligence.llm", description: "Planificador con LLM (beta)", defaultEnabled: false },
    ],
  });
  await user("plataforma@or-k.co", "Operador OR-K", true);

  // ── PRESSERVAC (cliente #1 · manufactura) ──
  const P = await org("presservac", "PRESSERVAC", {
    legalName: "PRESSERVAC S.A.S.", taxId: "900.123.456-7", industry: "Manufactura",
    branding: { primaryColor: "#0e7490", displayName: "PRESSERVAC" },
    settings: { radar: { staleOpportunityDays: 10 } },
  });
  await prisma.subscription.create({ data: { organizationId: P.orgId, planKey: "enterprise", status: "ACTIVE" } });
  await ensureBaseRoles(P);
  // Bodegas en cadena: Materia prima → Planta → Producto terminado (PT es la bodega de despacho)
  const PT = await createWarehouse(P, { code: "PT", name: "Producto terminado" });
  const MP = await createWarehouse(P, { code: "MP", name: "Materia prima" });
  const PLT = await createWarehouse(P, { code: "PLT", name: "Planta de fabricación" });
  await applyTemplate(P, "manufacturing");

  const owner = await user("admin@presservac.co", "Laura Méndez");
  const gerente = await user("gerencia@presservac.co", "Andrés Rojas");
  const comercial = await user("comercial@presservac.co", "Camila Torres");
  const inventario = await user("inventario@presservac.co", "Jorge Patiño");
  const calidad = await user("calidad@presservac.co", "Sofía Herrera");
  const finanzas = await user("finanzas@presservac.co", "Daniel Gómez");
  const produccion = await user("produccion@presservac.co", "Felipe Ruiz");
  await member(P, owner.id, "OWNER", "Directora de operaciones");
  await member(P, gerente.id, "MANAGEMENT", "Gerente general");
  await member(P, comercial.id, "SALES", "Ejecutiva comercial");
  await member(P, inventario.id, "INVENTORY", "Jefe de almacén y compras");
  await member(P, calidad.id, "QUALITY", "Coordinadora de calidad");
  await member(P, finanzas.id, "FINANCE", "Analista de cartera");
  await member(P, produccion.id, "PRODUCTION", "Jefe de planta");
  const as = (actorId: string, roleKey: string, name: string) =>
    ({ ...P, actorId, user: { id: actorId, name, email: "", isPlatformAdmin: false }, role: { id: "", key: roleKey, name: roleKey }, can: () => true, hasModule: () => true }) as unknown as OrgContext;

  const dept = await P.db.orgUnit.create({ data: { organizationId: P.orgId, kind: "DEPARTMENT", name: "Producción" } });
  await P.db.orgUnit.createMany({ data: ["Comercial", "Calidad", "Almacén", "Mantenimiento", "Gerencia"].map((name) => ({ organizationId: P.orgId, kind: "DEPARTMENT", name })) });

  // Campos personalizados propios de PRESSERVAC (configuración, no código)
  const cf = [
    { key: "industry_type", label: "Tipo de industria", type: "select", options: [
      { value: "food", label: "Alimentos" }, { value: "pharma", label: "Farmacéutica" }, { value: "automotive", label: "Automotriz" },
      { value: "chemical", label: "Química" }, { value: "oil_gas", label: "Oil & Gas" }, { value: "other", label: "Otra" }], required: true },
    { key: "required_certification", label: "Certificación requerida", type: "multiselect", options: [
      { value: "iso9001", label: "ISO 9001" }, { value: "asme", label: "ASME" }, { value: "api", label: "API" },
      { value: "invima", label: "INVIMA" }, { value: "none", label: "Ninguna" }] },
    { key: "commercial_zone", label: "Zona comercial", type: "select", options: [
      { value: "north", label: "Norte" }, { value: "center", label: "Centro" }, { value: "south", label: "Sur" },
      { value: "east", label: "Oriente" }, { value: "west", label: "Occidente" }] },
  ];
  for (const [i, f] of cf.entries()) {
    await P.db.customFieldDefinition.create({ data: { organizationId: P.orgId, entityType: "customer", position: i, ...f } });
  }

  // Plazos y listas de precios
  const term = async (name: string) => (await P.db.paymentTerm.findFirstOrThrow({ where: { name } })).id;
  const t30 = await term("30 días"), tAnt = await term("30% anticipo, saldo a 60 días");
  const industrial = await P.db.pricelist.create({ data: { organizationId: P.orgId, name: "Clientes industriales", items: { create: [{ category: "Equipos", discountPct: 5 }, { category: "Repuestos", minQty: 10, discountPct: 8 }] } } });

  const S: ExecContext = { ...P, actorId: comercial.id };
  const customers = [];
  for (const c of [
    { name: "Alimentos del Valle S.A.", taxId: "800.111.222-1", city: "Cali", pl: true, cf: { industry_type: "food", required_certification: ["iso9001", "invima"], commercial_zone: "west" } },
    { name: "Laboratorios Andinos", taxId: "830.222.333-2", city: "Bogotá", pl: true, cf: { industry_type: "pharma", required_certification: ["invima"], commercial_zone: "center" } },
    { name: "Ensambles Automotrices del Norte", taxId: "890.333.444-3", city: "Barranquilla", cf: { industry_type: "automotive", required_certification: ["iso9001"], commercial_zone: "north" } },
    { name: "Química Industrial Colombiana", taxId: "860.444.555-4", city: "Medellín", cf: { industry_type: "chemical", required_certification: ["asme"], commercial_zone: "west" } },
    { name: "Petroservicios del Oriente", taxId: "900.555.666-5", city: "Villavicencio", term: tAnt, cf: { industry_type: "oil_gas", required_certification: ["api", "asme"], commercial_zone: "east" } },
    { name: "Lácteos La Pradera", taxId: "811.666.777-6", city: "Bucaramanga", cf: { industry_type: "food", required_certification: ["invima"], commercial_zone: "east" } },
  ]) {
    customers.push(await createCustomer(S, {
      name: c.name, taxId: c.taxId, city: c.city, ownerId: comercial.id, customFields: c.cf,
      email: `compras@${c.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.co`,
      pricelistId: c.pl ? industrial.id : undefined, paymentTermId: c.term ?? t30,
    }));
  }

  // Proveedores
  const sup = await P.db.supplier.createManyAndReturn({ data: [
    { organizationId: P.orgId, name: "Aceros Especiales Ltda.", taxId: "800.900.100-1", paymentTermId: t30, customFields: { approved_supplier: true } },
    { organizationId: P.orgId, name: "Sellos y Empaques S.A.S.", taxId: "900.800.200-2", paymentTermId: t30, customFields: { approved_supplier: true } },
    { organizationId: P.orgId, name: "Instrumentación Técnica", taxId: "830.700.300-3", paymentTermId: t30, customFields: { approved_supplier: false } },
  ] });
  const [aceros, sellos, instrum] = sup;

  // Productos: materias primas, componentes/repuestos, terminados, kit y servicios
  const I: ExecContext = { ...P, actorId: inventario.id };
  const prod: Record<string, { id: string; name: string; price: unknown; cost?: unknown; kind?: string }> = {};
  for (const p of [
    { sku: "MP-LAM-316", name: "Lámina inox 316L 3 mm (1.2×2.4 m)", category: "Materia prima", unit: "LAM", cost: 1_450_000, canBeSold: false, defaultSupplierId: aceros.id },
    { sku: "MP-LAM-AC", name: "Lámina acero al carbono 6 mm", category: "Materia prima", unit: "LAM", cost: 780_000, canBeSold: false, defaultSupplierId: aceros.id },
    { sku: "MP-TUB-2", name: "Tubería inox 2\" (tramo 6 m)", category: "Materia prima", unit: "TRAMO", cost: 620_000, canBeSold: false, defaultSupplierId: aceros.id },
    { sku: "MP-SOL-KG", name: "Soldadura ER316L", category: "Materia prima", unit: "KG", cost: 95_000, canBeSold: false, defaultSupplierId: aceros.id },
    { sku: "PV-VAL-2", name: "Válvula de seguridad 2\"", category: "Repuestos", price: 1_850_000, cost: 920_000, minStock: 20, defaultSupplierId: instrum.id, cf: { material: "Bronce", lead_time_days: 15 } },
    { sku: "PV-MAN-01", name: "Manómetro glicerina 0-300 psi", category: "Repuestos", price: 320_000, cost: 140_000, minStock: 30, defaultSupplierId: instrum.id, cf: { material: "Acero inoxidable", lead_time_days: 10 } },
    { sku: "PV-EMP-KIT", name: "Kit de empaques de alta temperatura", category: "Repuestos", price: 640_000, cost: 260_000, minStock: 15, defaultSupplierId: sellos.id, cf: { material: "Silicona grado alimenticio", lead_time_days: 20 } },
    { sku: "PV-ACP-100", name: "Autoclave de presión 100 L", category: "Equipos", price: 48_000_000, cost: 31_000_000, minStock: 2, canBePurchased: false, invoicePolicy: "DELIVERY", cf: { material: "Acero inoxidable 316L", lead_time_days: 45 } },
    { sku: "PV-ACP-300", name: "Autoclave de presión 300 L", category: "Equipos", price: 96_000_000, cost: 64_000_000, minStock: 2, canBePurchased: false, invoicePolicy: "DELIVERY", cf: { material: "Acero inoxidable 316L", lead_time_days: 60 } },
    { sku: "PV-TQ-500", name: "Tanque presurizado 500 L", category: "Equipos", price: 27_500_000, cost: 17_000_000, minStock: 3, canBePurchased: false, invoicePolicy: "DELIVERY", cf: { material: "Acero al carbono", lead_time_days: 30 } },
    { sku: "PV-KIT-MTO", name: "Kit de repuestos de mantenimiento", category: "Repuestos", price: 3_900_000, kind: "COMBO", canBePurchased: false },
    { sku: "PV-SRV-MTO", name: "Mantenimiento preventivo anual", category: "Servicios", unit: "SERV", price: 6_500_000, cost: 2_900_000, kind: "SERVICE", canBePurchased: false },
    { sku: "PV-SRV-CAL", name: "Calibración y certificación", category: "Servicios", unit: "SERV", price: 2_400_000, cost: 900_000, kind: "SERVICE", canBePurchased: false },
  ]) {
    const { cf: pcf, ...rest } = p as typeof p & { cf?: object };
    prod[p.sku] = await createProduct(I, { ...rest, customFields: pcf ?? {} });
  }
  const pid = (sku: string) => prod[sku].id;

  // Centros de trabajo y listas de materiales
  const wc = await P.db.workCenter.createManyAndReturn({ data: [
    { organizationId: P.orgId, code: "CR", name: "Corte y rolado", costPerHour: 85_000 },
    { organizationId: P.orgId, code: "SOL", name: "Soldadura calificada", costPerHour: 120_000, capacity: 2 },
    { organizationId: P.orgId, code: "PH", name: "Prueba hidrostática", costPerHour: 60_000 },
  ] });
  const ops = (cr: number, sol: number, ph: number) => [
    { workCenterId: wc[0].id, name: "Corte y rolado", durationMinutes: cr }, { workCenterId: wc[1].id, name: "Soldadura", durationMinutes: sol }, { workCenterId: wc[2].id, name: "Prueba hidrostática", durationMinutes: ph },
  ];
  const M: ExecContext = { ...P, actorId: produccion.id };
  await createBom(M, { productId: pid("PV-ACP-100"), code: "BOM-ACP100", lines: [
    { componentId: pid("MP-LAM-316"), quantity: 4 }, { componentId: pid("MP-TUB-2"), quantity: 2 }, { componentId: pid("MP-SOL-KG"), quantity: 6 },
    { componentId: pid("PV-VAL-2"), quantity: 1 }, { componentId: pid("PV-MAN-01"), quantity: 1 }, { componentId: pid("PV-EMP-KIT"), quantity: 1 },
  ], operations: ops(240, 480, 120) });
  await createBom(M, { productId: pid("PV-ACP-300"), code: "BOM-ACP300", lines: [
    { componentId: pid("MP-LAM-316"), quantity: 9 }, { componentId: pid("MP-TUB-2"), quantity: 4 }, { componentId: pid("MP-SOL-KG"), quantity: 14 },
    { componentId: pid("PV-VAL-2"), quantity: 2 }, { componentId: pid("PV-MAN-01"), quantity: 2 }, { componentId: pid("PV-EMP-KIT"), quantity: 2 },
  ], operations: ops(420, 900, 180) });
  await createBom(M, { productId: pid("PV-TQ-500"), code: "BOM-TQ500", lines: [
    { componentId: pid("MP-LAM-AC"), quantity: 6 }, { componentId: pid("MP-TUB-2"), quantity: 3 }, { componentId: pid("MP-SOL-KG"), quantity: 8 },
    { componentId: pid("PV-VAL-2"), quantity: 1 }, { componentId: pid("PV-MAN-01"), quantity: 1 },
  ], operations: ops(180, 360, 90) });
  await createBom(M, { productId: pid("PV-KIT-MTO"), type: "KIT", lines: [
    { componentId: pid("PV-VAL-2"), quantity: 1 }, { componentId: pid("PV-MAN-01"), quantity: 2 }, { componentId: pid("PV-EMP-KIT"), quantity: 1 },
  ] });

  // Existencias iniciales por bodega (ajustes trazables)
  const stockAt = { [MP.stockLocationId!]: { "MP-LAM-316": 24, "MP-LAM-AC": 10, "MP-TUB-2": 14, "MP-SOL-KG": 40 },
    [PLT.stockLocationId!]: { "MP-LAM-316": 6, "MP-TUB-2": 4, "MP-SOL-KG": 12, "PV-VAL-2": 4, "PV-MAN-01": 6, "PV-EMP-KIT": 3 },
    [PT.stockLocationId!]: { "PV-ACP-100": 4, "PV-ACP-300": 1, "PV-TQ-500": 6, "PV-VAL-2": 9, "PV-MAN-01": 55 } };
  for (const [loc, items] of Object.entries(stockAt)) for (const [sku, q] of Object.entries(items)) await adjustStock(I, pid(sku), loc, q, "Inventario inicial");

  // Reabastecimiento: PT compra repuestos · PLT trae de MP · MP compra a proveedores · fabricar en PLT (manual)
  const rule = (sku: string, loc: string, min: number, max: number, action: string, extra: object = {}) =>
    P.db.reorderRule.create({ data: { organizationId: P.orgId, productId: pid(sku), locationId: loc, minQty: min, maxQty: max, action, ...extra } });
  await rule("PV-VAL-2", PT.stockLocationId!, 10, 30, "BUY");
  await rule("PV-MAN-01", PT.stockLocationId!, 30, 80, "BUY");
  await rule("PV-EMP-KIT", PT.stockLocationId!, 8, 30, "BUY");
  await rule("PV-ACP-100", PT.stockLocationId!, 2, 4, "TRANSFER", { sourceLocationId: PLT.stockLocationId });
  await rule("MP-LAM-316", PLT.stockLocationId!, 8, 20, "TRANSFER", { sourceLocationId: MP.stockLocationId });
  await rule("MP-SOL-KG", PLT.stockLocationId!, 10, 30, "TRANSFER", { sourceLocationId: MP.stockLocationId });
  await rule("PV-ACP-100", PLT.stockLocationId!, 1, 2, "MANUFACTURE", { trigger: "MANUAL" });
  await rule("MP-LAM-316", MP.stockLocationId!, 10, 40, "BUY", { multiple: 5 });
  await rule("MP-LAM-AC", MP.stockLocationId!, 4, 12, "BUY");
  await rule("MP-TUB-2", MP.stockLocationId!, 6, 20, "BUY");
  await rule("MP-SOL-KG", MP.stockLocationId!, 20, 60, "BUY", { multiple: 10 });
  await runReplenishment(I);

  // Compras: requisiciones de áreas, OC con doble validación (> $2.000.000), recepción parcial, factura de proveedor
  const wfR = (await getWorkflow(P.db, "requisition"))!, wfP = (await getWorkflow(P.db, "purchase_order"))!;
  const tr = (wf: typeof wfR, from: string, to: string) => wf.transitions.find((t) => t.fromKey === from && t.toKey === to)!.id;
  const prodCtx = as(produccion.id, "PRODUCTION", "Felipe Ruiz"), invCtx = as(inventario.id, "INVENTORY", "Jorge Patiño"), gerCtx = as(gerente.id, "MANAGEMENT", "Andrés Rojas");
  const rq1 = await createRequisition(prodCtx, { area: "Producción", neededBy: new Date(Date.now() + 7 * DAY).toISOString(), suggestedSupplier: "Aceros Especiales",
    lines: [{ productId: pid("MP-SOL-KG"), description: "Soldadura ER316L", quantity: 30 }, { productId: pid("MP-TUB-2"), description: "Tubería inox 2\"", quantity: 6 }] });
  await executeTransition(prodCtx, "requisition", rq1.id, tr(wfR, "draft", "submitted"));
  const rq2 = await createRequisition(as(calidad.id, "QUALITY", "Sofía Herrera"), { area: "Mantenimiento", neededBy: new Date(Date.now() + 10 * DAY).toISOString(),
    lines: [{ productId: pid("MP-LAM-AC"), description: "Lámina acero al carbono 6 mm", quantity: 6 }], notes: "Reposición de guardas de la prensa" });
  await executeTransition(prodCtx, "requisition", rq2.id, tr(wfR, "draft", "submitted"));
  await executeTransition(gerCtx, "requisition", rq2.id, tr(wfR, "submitted", "approved"));
  const po2 = await rfqFromRequisition(invCtx, rq2.id, aceros.id);
  await executeTransition(invCtx, "purchase_order", po2.id, tr(wfP, "draft", "purchase")); // > 2M → queda Por aprobar (Gerencia)

  const po3 = await createPurchaseOrder(invCtx, { supplierId: instrum.id, warehouseId: PT.id, expectedAt: new Date(Date.now() - 5 * DAY).toISOString(),
    lines: [{ productId: pid("PV-MAN-01"), description: "Manómetro glicerina 0-300 psi", quantity: 20, unitPrice: 140_000 }] });
  await executeTransition(invCtx, "purchase_order", po3.id, tr(wfP, "draft", "purchase"));
  const ap3 = await P.db.approval.findFirstOrThrow({ where: { entityId: po3.id, status: "PENDING" } });
  await decideApproval(gerCtx, ap3.id, true, "Aprobado: reposición urgente");
  const rec3 = await P.db.transfer.findFirstOrThrow({ where: { sourceType: "purchase_order", sourceId: po3.id }, include: { lines: true } });
  await validateTransfer(I, rec3.id, { [rec3.lines[0].id]: 12 }); // llegó parcial → backorder de 8 (atrasado)
  const F: ExecContext = { ...P, actorId: finanzas.id };
  const bill3 = await billFromPurchaseOrder(F, po3.id, "IT-55821");
  await registerPayment(F, { billId: bill3.id, amount: 1_000_000, reference: "Abono transferencia" });

  // Manufactura: OP en curso (parcial y atrasada) y OP programada
  const wfM = (await getWorkflow(P.db, "production"))!;
  const op1 = await createProduction(M, { productId: pid("PV-ACP-100"), quantity: 2, warehouseId: PLT.id, origin: "Plan semanal", scheduledAt: new Date(Date.now() - 3 * DAY) });
  await executeTransition(as(produccion.id, "PRODUCTION", "Felipe Ruiz"), "production", op1.id, tr(wfM, "draft", "confirmed"));
  const wo = await P.db.workOrder.findMany({ where: { productionId: op1.id }, orderBy: { position: "asc" } });
  await workOrderAction(M, wo[0].id, "start");
  await workOrderAction(M, wo[0].id, "finish");
  await workOrderAction(M, wo[1].id, "start");
  await produce(M, op1.id, 1);
  await createProduction(M, { productId: pid("PV-TQ-500"), quantity: 3, warehouseId: PLT.id, origin: "Pronóstico Q4", scheduledAt: new Date(Date.now() + 5 * DAY) });

  // Historial de 9 meses para tableros
  await seedHistory(P, {
    customers, sellers: [comercial.id, gerente.id], buyerId: inventario.id, suppliers: sup, warehouseId: PT.id, plantId: PLT.id, plantLocationId: PLT.stockLocationId!,
    products: Object.values(prod).map((p) => ({ id: p.id, name: p.name, price: Number(p.price ?? 0), cost: Number((p as { cost?: unknown }).cost ?? 0), kind: String((p as { kind?: string }).kind ?? "GOODS") })),
    manufactured: [prod["PV-ACP-100"], prod["PV-ACP-300"], prod["PV-TQ-500"]],
  });

  // Oportunidades
  const opps = [
    { title: "Línea de esterilización · Alimentos del Valle", c: 0, amount: 210_000_000, status: "negotiation", days: 2 },
    { title: "Renovación de autoclaves · Laboratorios Andinos", c: 1, amount: 145_000_000, status: "proposal", days: 18 },
    { title: "Tanques para planta Barranquilla", c: 2, amount: 82_000_000, status: "qualified", days: 25 },
    { title: "Contrato de mantenimiento 2027", c: 3, amount: 39_000_000, status: "new", days: 1 },
    { title: "Recipientes API · Petroservicios", c: 4, amount: 320_000_000, status: "proposal", days: 12 },
  ];
  for (const o of opps) {
    const opp = await createOpportunity(S, { title: o.title, customerId: customers[o.c].id, amount: o.amount, ownerId: comercial.id });
    await P.db.opportunity.update({ where: { id: opp.id }, data: { status: o.status, lastActivityAt: new Date(Date.now() - o.days * DAY) } });
  }

  // Ventas: cotización grande pendiente · cotización convertida en pedido entregado y facturado (vencido) · pedidos directos
  const salesCtx = as(comercial.id, "SALES", "Camila Torres");
  const wfQ = (await getWorkflow(P.db, "quote"))!;
  const q1 = await createQuote(S, { customerId: customers[1].id, taxRate: 19, lines: [
    { productId: pid("PV-ACP-300"), description: prod["PV-ACP-300"].name, quantity: 1, unitPrice: 96_000_000 },
    { productId: pid("PV-SRV-CAL"), description: prod["PV-SRV-CAL"].name, quantity: 1, unitPrice: 2_400_000 },
  ] });
  await executeTransition(salesCtx, "quote", q1.id, tr(wfQ, "draft", "sent"));
  const q2 = await createQuote(S, { customerId: customers[5].id, taxRate: 19, lines: [
    { productId: pid("PV-VAL-2"), description: prod["PV-VAL-2"].name, quantity: 4, unitPrice: 1_850_000 },
    { productId: pid("PV-MAN-01"), description: prod["PV-MAN-01"].name, quantity: 6, unitPrice: 320_000 },
  ] });
  for (const [a, b] of [["draft", "sent"], ["sent", "approved"], ["approved", "converted"]]) await executeTransition(salesCtx, "quote", q2.id, tr(wfQ, a, b));
  await createQuote(S, { customerId: customers[3].id, taxRate: 19, lines: [{ productId: pid("PV-SRV-MTO"), description: prod["PV-SRV-MTO"].name, quantity: 2, unitPrice: 6_500_000 }] });

  const so1 = await P.db.salesOrder.findFirstOrThrow({ where: { quoteId: q2.id } });
  const del1 = await P.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: so1.id } });
  await validateTransfer(I, del1.id);
  const inv1 = await invoiceFromSalesOrder(F, so1.id);
  await P.db.invoice.update({ where: { id: inv1.id }, data: { issuedAt: new Date(Date.now() - 70 * DAY), dueDate: new Date(Date.now() - 40 * DAY) } });

  const so2 = await createSalesOrder(S, { customerId: customers[0].id, warehouseId: PT.id, pricelistId: industrial.id, commitmentAt: new Date(Date.now() - 2 * DAY), lines: [
    { productId: pid("PV-ACP-100"), description: prod["PV-ACP-100"].name, quantity: 1, unitPrice: await priceFor(S, industrial.id, pid("PV-ACP-100"), 1) },
    { productId: pid("PV-KIT-MTO"), description: prod["PV-KIT-MTO"].name, quantity: 2, unitPrice: 3_900_000 },
  ] });
  await addActivity(S, "sales_order", so2.id, "Cliente solicita despacho urgente para arranque de planta");

  const so3 = await createSalesOrder(S, { customerId: customers[4].id, warehouseId: PT.id, lines: [
    { productId: pid("PV-TQ-500"), description: prod["PV-TQ-500"].name, quantity: 2, unitPrice: 27_500_000 },
    { productId: pid("PV-SRV-MTO"), description: prod["PV-SRV-MTO"].name, quantity: 1, unitPrice: 6_500_000 },
  ] });
  const del3 = await P.db.transfer.findFirstOrThrow({ where: { sourceType: "sales_order", sourceId: so3.id } });
  await validateTransfer(I, del3.id);
  const inv3 = await invoiceFromSalesOrder(F, so3.id);
  await registerPayment(F, { invoiceId: inv3.id, amount: Math.round(Number(inv3.total) * 0.3), reference: "Anticipo 30%" });

  // Cartera adicional (vencida hace 8 días)
  await P.db.invoice.create({ data: {
    organizationId: P.orgId, number: await nextNumber(P.db, P.orgId, "FV"), customerId: customers[0].id, subtotal: 49_075_630, tax: 9_324_370,
    total: 58_400_000, balance: 58_400_000, issuedAt: new Date(Date.now() - 38 * DAY), dueDate: new Date(Date.now() - 8 * DAY), paymentTermId: t30,
    lines: { create: [{ description: "Servicio de reparación y recertificación ASME", quantity: 1, unitPrice: 49_075_630, taxRate: 19, subtotal: 49_075_630 }] },
  } });

  // Calidad: proveedor con no conformidades repetidas
  const Q: ExecContext = { ...P, actorId: calidad.id };
  for (const nc of [
    { title: "Empaques con dureza fuera de especificación", severity: "HIGH", s: sellos.id },
    { title: "Lote de empaques con fisuras", severity: "MEDIUM", s: sellos.id },
    { title: "Certificado de material incompleto", severity: "LOW", s: sellos.id },
    { title: "Lámina con espesor inferior", severity: "HIGH", s: aceros.id },
  ]) {
    await createNonconformity(Q, { title: nc.title, severity: nc.severity, supplierId: nc.s, productId: pid("PV-EMP-KIT") });
  }

  // Studio: objeto personalizado "Visita técnica" (configuración pura, sin código)
  const visita = await createCustomEntity(P, { key: "visita", label: "Visita técnica", labelPlural: "Visitas técnicas", icon: "wrench", prefix: "VT", hasLines: true, states: ["Programada", "En sitio", "Informe entregado", "Cerrada"] });
  const vf = [
    { key: "cliente", label: "Cliente", type: "relation", options: { entityType: "customer" }, required: true },
    { key: "fecha", label: "Fecha de la visita", type: "date", required: true },
    { key: "tecnico", label: "Técnico", type: "user" },
    { key: "tipo", label: "Tipo de servicio", type: "select", options: [{ value: "preventivo", label: "Preventivo" }, { value: "correctivo", label: "Correctivo" }, { value: "garantia", label: "Garantía" }] },
    { key: "serial", label: "Serial del equipo", type: "text", validation: { pattern: "^[A-Z]{2}-\\d{4,}$", patternMessage: "Formato AA-0000" } },
    { key: "hallazgos", label: "Hallazgos", type: "textarea" },
  ];
  for (const [i, f] of vf.entries()) await P.db.customFieldDefinition.create({ data: { organizationId: P.orgId, entityType: "x:visita", position: i, ...f } });
  await P.db.customFieldDefinition.createMany({ data: [
    { organizationId: P.orgId, entityType: "x:visita:line", key: "producto", label: "Repuesto", type: "relation", options: { entityType: "product" }, position: 0 },
    { organizationId: P.orgId, entityType: "x:visita:line", key: "cantidad", label: "Cantidad", type: "number", position: 1, validation: { min: 0 } },
  ] });
  for (const k of ["SALES", "QUALITY", "PRODUCTION"]) {
    const r = await P.db.role.findFirstOrThrow({ where: { key: k } });
    await P.db.role.update({ where: { id: r.id }, data: { permissions: [...r.permissions, `custom.${visita.key}.*`] } });
  }
  const QV = { ...P, actorId: calidad.id };
  const v1 = await createRecord(QV, "visita", { cliente: customers[5].id, fecha: new Date(Date.now() - 3 * DAY).toISOString(), tecnico: calidad.id, tipo: "correctivo", serial: "AC-10045", hallazgos: "Fuga en empaque de la tapa. Se reemplazó kit de empaques y se recalibró manómetro." },
    [{ producto: pid("PV-EMP-KIT"), cantidad: 1 }, { producto: pid("PV-MAN-01"), cantidad: 1 }]);
  const wfV = (await getWorkflow(P.db, "x:visita"))!;
  await executeTransition(as(calidad.id, "QUALITY", "Sofía Herrera"), "x:visita", v1.id, tr(wfV, "draft", "s1"));
  await createRecord(QV, "visita", { cliente: customers[1].id, fecha: new Date(Date.now() + 4 * DAY).toISOString(), tecnico: calidad.id, tipo: "preventivo", serial: "AC-30012" });
  await P.db.automation.create({ data: {
    organizationId: P.orgId, name: "Visita correctiva → tarea de seguimiento", kind: "AUTOMATION", trigger: "CustomRecordCreated",
    description: "Las visitas correctivas generan una tarea comercial para ofrecer contrato de mantenimiento",
    conditions: { all: [{ field: "tipo", op: "eq", value: "correctivo" }] },
    actions: [{ type: "CREATE_TASK", title: "Ofrecer contrato de mantenimiento ({{number}})", assignTo: { role: "SALES" }, dueInDays: 3 }],
  } });

  // Conocimiento + grafo: proceso crítico que depende del conocimiento de una sola persona
  const K: ExecContext = { ...P, actorId: owner.id };
  const sys = await P.db.orgUnit.create({ data: { organizationId: P.orgId, kind: "SYSTEM", name: "PLC de soldadura" } });
  const proc = await createKnowledge(K, { type: "PROCESS", title: "Fabricación de recipientes a presión", criticality: "CRITICAL", ownerId: gerente.id, departmentId: dept.id,
    body: "1. Recepción de lámina certificada\n2. Corte y rolado\n3. Soldadura calificada (WPS/PQR)\n4. Prueba hidrostática\n5. Certificación ASME" });
  const weld = await createKnowledge(K, { type: "PROCEDURE", title: "Calibración del PLC de soldadura orbital", criticality: "HIGH", ownerId: inventario.id,
    body: "Procedimiento conocido únicamente por el jefe de almacén (antiguo técnico de soldadura). Pendiente de documentar." });
  const hydro = await createKnowledge(K, { type: "PROCEDURE", title: "Prueba hidrostática", criticality: "HIGH", ownerId: calidad.id,
    body: "Presurizar a 1.5x la presión de diseño durante 30 minutos. Registrar en formato FQ-07." });
  await createKnowledge(K, { type: "POLICY", title: "Política de calidad", criticality: "MEDIUM", ownerId: owner.id, body: "PRESSERVAC se compromete con…" });
  await link(K, "KNOWLEDGE", proc.id, "DEPENDS_ON", "KNOWLEDGE", weld.id);
  await link(K, "KNOWLEDGE", proc.id, "DEPENDS_ON", "KNOWLEDGE", hydro.id);
  await link(K, "USER", gerente.id, "BACKUP_FOR", "KNOWLEDGE", hydro.id);
  await link(K, "KNOWLEDGE", weld.id, "USES", "SYSTEM", sys.id);
  await link(K, "KNOWLEDGE", proc.id, "BELONGS_TO", "DEPARTMENT", dept.id);
  for (const k of [proc, hydro]) await publishKnowledge(K, k.id);

  const session = await P.db.sonarSession.create({ data: {
    organizationId: P.orgId, title: "Sonar · Planta de producción", area: "Producción", facilitatorId: owner.id,
    participants: [gerente.id, inventario.id, calidad.id], summary: "Levantamiento del proceso de fabricación y dependencias críticas.",
  } });
  await addSonarItem(K, session.id, { kind: "RISK", title: "Solo una persona sabe calibrar el PLC de soldadura", ownerId: inventario.id });
  await addSonarItem(K, session.id, { kind: "PROCESS", title: "Inspección de lámina en recepción", description: "Verificar certificado de colada y espesor.", ownerId: calidad.id });
  await addSonarItem(K, session.id, { kind: "ACTION", title: "Grabar video del procedimiento de calibración", ownerId: inventario.id });
  await addSonarItem(K, session.id, { kind: "OPPORTUNITY", title: "Ofrecer contratos de mantenimiento a toda la base instalada" });

  await P.db.webhookEndpoint.create({ data: {
    organizationId: P.orgId, url: "http://localhost:3000/api/dev/webhook-sink", description: "Receptor de pruebas local",
    secret: "whsec_demo_presservac", events: ["quote.*", "invoice.*", "inventory.low", "payment.received"],
  } });
  await runRadar(P);

  // ── Segunda organización: demuestra multiempresa con configuración distinta ──
  const A = await org("andina", "Distribuidora Andina", {
    industry: "Distribución", branding: { primaryColor: "#7c3aed", displayName: "Andina" },
  });
  await prisma.subscription.create({ data: { organizationId: A.orgId, planKey: "growth", status: "TRIAL" } });
  await ensureBaseRoles(A);
  await applyTemplate(A, "distribution");
  const andinaOwner = await user("admin@andina.co", "Mateo Vargas");
  await member(A, andinaOwner.id, "OWNER", "Gerente");
  await member(A, comercial.id, "SALES", "Asesora externa"); // mismo usuario, otra empresa, otro rol
  const AS: ExecContext = { ...A, actorId: andinaOwner.id };
  for (const c of ["Supermercados La 14", "Tiendas D1 Regional", "Droguerías Unidas"]) {
    await createCustomer(AS, { name: c, city: "Bogotá", customFields: { channel: "wholesale" } });
  }
  await createProduct(AS, { sku: "AN-001", name: "Aceite vegetal 3L", price: 28_000, cost: 21_000, stock: 40, minStock: 100 });
  await runRadar(A);

  console.log("\n✔ Seed listo. Contraseña para todos los usuarios:", PASSWORD);
  console.log("  plataforma@or-k.co (OR-K)  · admin@presservac.co · gerencia@presservac.co · comercial@presservac.co (2 empresas)");
  console.log("  inventario@presservac.co · calidad@presservac.co · finanzas@presservac.co · produccion@presservac.co · admin@andina.co\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
