import { notFound } from "next/navigation";
import { requireModule } from "@/lib/core/context";
import { getFieldDefs } from "@/lib/core/custom-fields";
import { orgUsers } from "@/lib/core/members";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../../customer-form";

export default async function EditCustomer({ params }: PageProps<"/crm/customers/[id]/edit">) {
  const ctx = await requireModule("crm", "crm.customers.write");
  const { id } = await params;
  const customer = await ctx.db.customer.findUnique({ where: { id } });
  if (!customer) notFound();
  const [defs, users, pricelists, terms] = await Promise.all([getFieldDefs(ctx.db, "customer"), orgUsers(ctx), ctx.db.pricelist.findMany(), ctx.db.paymentTerm.findMany()]);
  return (
    <>
      <PageHeader title={`Editar ${customer.name}`} crumbs={[{ label: "Clientes", href: "/crm/customers" }, { label: customer.name, href: `/crm/customers/${id}` }, { label: "Editar" }]} />
      <CustomerForm customer={customer} defs={defs} users={users} pricelists={pricelists} terms={terms} />
    </>
  );
}
