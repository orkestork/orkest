import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { orgUsers } from "@/lib/core/members";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../customer-form";

export default async function NewCustomer() {
  const ctx = await requireModule("crm", "crm.customers.write");
  const [defs, users, pricelists, terms] = await Promise.all([getFieldDefs(ctx.db, "customer"), orgUsers(ctx), ctx.db.pricelist.findMany(), ctx.db.paymentTerm.findMany()]);
  return (
    <>
      <PageHeader title="Nuevo cliente" crumbs={[{ label: "Clientes", href: "/crm/customers" }, { label: "Nuevo" }]} />
      <CustomerForm defs={defs} users={users} pricelists={pricelists} terms={terms} />
    </>
  );
}
