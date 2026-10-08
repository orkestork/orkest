/**
 * Catálogo de eventos de dominio. Cada evento alimenta automatizaciones,
 * notificaciones, Radar, auditoría e integraciones (webhooks).
 * `webhook` es el nombre público estable (contrato de API).
 */
export type EventDef = { type: string; label: string; entityType: string; module: string | null; webhook: string };

export const EVENTS: EventDef[] = [
  { type: "CustomerCreated", label: "Cliente creado", entityType: "customer", module: "crm", webhook: "customer.created" },
  { type: "CustomerUpdated", label: "Cliente actualizado", entityType: "customer", module: "crm", webhook: "customer.updated" },
  { type: "LeadCreated", label: "Lead creado", entityType: "opportunity", module: "crm", webhook: "lead.created" },
  { type: "OpportunityStatusChanged", label: "Oportunidad cambió de etapa", entityType: "opportunity", module: "crm", webhook: "opportunity.status_changed" },
  { type: "OpportunityWon", label: "Oportunidad ganada", entityType: "opportunity", module: "crm", webhook: "opportunity.won" },
  { type: "OpportunityLost", label: "Oportunidad perdida", entityType: "opportunity", module: "crm", webhook: "opportunity.lost" },
  { type: "QuoteCreated", label: "Cotización creada", entityType: "quote", module: "sales", webhook: "quote.created" },
  { type: "QuoteUpdated", label: "Cotización modificada", entityType: "quote", module: "sales", webhook: "quote.updated" },
  { type: "QuoteStatusChanged", label: "Cotización cambió de estado", entityType: "quote", module: "sales", webhook: "quote.status_changed" },
  { type: "QuoteSent", label: "Cotización enviada", entityType: "quote", module: "sales", webhook: "quote.sent" },
  { type: "QuoteApproved", label: "Cotización aprobada", entityType: "quote", module: "sales", webhook: "quote.approved" },
  { type: "QuoteRejected", label: "Cotización rechazada", entityType: "quote", module: "sales", webhook: "quote.rejected" },
  { type: "SalesOrderConfirmed", label: "Pedido confirmado", entityType: "sales_order", module: "sales", webhook: "sales_order.confirmed" },
  { type: "ApprovalRequested", label: "Aprobación solicitada", entityType: "approval", module: null, webhook: "approval.requested" },
  { type: "ApprovalDecided", label: "Aprobación decidida", entityType: "approval", module: null, webhook: "approval.decided" },
  { type: "ProductCreated", label: "Producto creado", entityType: "product", module: "products", webhook: "product.created" },
  { type: "InventoryBelowMinimum", label: "Inventario bajo el mínimo", entityType: "product", module: "inventory", webhook: "inventory.low" },
  { type: "StockMoved", label: "Movimiento de inventario", entityType: "product", module: "inventory", webhook: "inventory.moved" },
  { type: "PurchaseOrderCreated", label: "Orden de compra creada", entityType: "purchase_order", module: "purchasing", webhook: "purchase_order.created" },
  { type: "GoodsReceived", label: "Mercancía recibida", entityType: "product", module: "purchasing", webhook: "goods.received" },
  { type: "ProductionStarted", label: "Producción iniciada", entityType: "production", module: "manufacturing", webhook: "production.started" },
  { type: "ProductionCompleted", label: "Producción completada", entityType: "production", module: "manufacturing", webhook: "production.completed" },
  { type: "InvoiceIssued", label: "Factura emitida", entityType: "invoice", module: "invoicing", webhook: "invoice.created" },
  { type: "InvoiceOverdue", label: "Factura vencida", entityType: "invoice", module: "invoicing", webhook: "invoice.overdue" },
  { type: "PaymentReceived", label: "Pago recibido", entityType: "invoice", module: "invoicing", webhook: "payment.received" },
  { type: "NonconformityCreated", label: "No conformidad creada", entityType: "nonconformity", module: "quality", webhook: "nonconformity.created" },
  { type: "RequisitionCreated", label: "Requisición creada", entityType: "requisition", module: "purchasing", webhook: "requisition.created" },
  { type: "RequisitionSubmitted", label: "Requisición enviada a aprobación", entityType: "requisition", module: "purchasing", webhook: "requisition.submitted" },
  { type: "RequisitionApproved", label: "Requisición aprobada", entityType: "requisition", module: "purchasing", webhook: "requisition.approved" },
  { type: "RequisitionRejected", label: "Requisición rechazada", entityType: "requisition", module: "purchasing", webhook: "requisition.rejected" },
  { type: "PurchaseOrderConfirmed", label: "Orden de compra confirmada", entityType: "purchase_order", module: "purchasing", webhook: "purchase_order.confirmed" },
  { type: "PurchaseOrderReceived", label: "Orden de compra recibida", entityType: "purchase_order", module: "purchasing", webhook: "purchase_order.received" },
  { type: "PurchaseOrderStatusChanged", label: "OC cambió de estado", entityType: "purchase_order", module: "purchasing", webhook: "purchase_order.status_changed" },
  { type: "TransferDone", label: "Transferencia validada", entityType: "transfer", module: "inventory", webhook: "transfer.done" },
  { type: "ProductionCreated", label: "Orden de producción creada", entityType: "production", module: "manufacturing", webhook: "production.created" },
  { type: "ProductionConfirmed", label: "Orden de producción confirmada", entityType: "production", module: "manufacturing", webhook: "production.confirmed" },
  { type: "DeliveryDone", label: "Entrega realizada", entityType: "sales_order", module: "sales", webhook: "delivery.done" },
  { type: "SalesOrderDone", label: "Pedido completado", entityType: "sales_order", module: "sales", webhook: "sales_order.done" },
  { type: "CreditNoteIssued", label: "Nota crédito emitida", entityType: "invoice", module: "invoicing", webhook: "credit_note.created" },
  { type: "BillPosted", label: "Factura de proveedor registrada", entityType: "bill", module: "invoicing", webhook: "bill.created" },
  { type: "PaymentSent", label: "Pago a proveedor", entityType: "bill", module: "invoicing", webhook: "payment.sent" },
  { type: "CustomRecordCreated", label: "Registro personalizado creado", entityType: "custom", module: null, webhook: "custom_record.created" },
  { type: "KnowledgePublished", label: "Conocimiento publicado", entityType: "knowledge", module: "knowledge", webhook: "knowledge.published" },
  { type: "SonarItemCreated", label: "Hallazgo Sonar registrado", entityType: "sonar_item", module: "sonar", webhook: "sonar.item_created" },
];

export const EVENT_MAP = new Map(EVENTS.map((e) => [e.type, e]));
export const webhookName = (type: string) => EVENT_MAP.get(type)?.webhook ?? type;
