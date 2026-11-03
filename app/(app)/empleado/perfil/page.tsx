import { ActionForm, SubmitButton } from "@/components/action-form";
import { btn, Card, Field, input, PageHeader } from "@/components/ui";
import { CONTRACT_TYPE, EMPLOYEE_STATUS, SALARY_PERIOD } from "@/lib/ui/hr-labels";
import { money } from "@/lib/ui/format";
import { updateMyProfile } from "../../hr/actions";
import { dday, Pill } from "../../hr/_ui";
import { NoProfile, portal } from "../_me";

export const metadata = { title: "Mi perfil" };

export default async function MyProfile() {
  const { ctx, me } = await portal();
  if (!me) return <NoProfile title="Mi perfil" />;
  const rows: [string, React.ReactNode][] = [
    ["Documento", me.documentNumber ?? "—"], ["Correo", me.email ?? ctx.user.email], ["Cargo", me.position ?? "—"], ["Departamento", me.department?.name ?? "—"],
    ["Jefe inmediato", me.manager?.name ?? "—"], ["Fecha de ingreso", dday(me.hireDate)], ["Contrato", CONTRACT_TYPE[me.contractType]],
    ["Salario", me.salaryAmount != null ? `${money(me.salaryAmount)} · ${SALARY_PERIOD[me.salaryPeriod]}` : "—"],
    ["EPS", me.eps ?? "—"], ["Fondo de pensiones", me.afp ?? "—"], ["ARL", me.arl ?? "—"], ["Estado", <Pill key="s" map={EMPLOYEE_STATUS} value={me.status} />],
  ];
  return (
    <>
      <PageHeader title={me.name} subtitle="Tus datos laborales. Si algo no está bien, crea una solicitud a talento humano." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Datos laborales">
          <dl className="grid gap-4 sm:grid-cols-2">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm">{v}</dd></div>)}</dl>
        </Card>
        <Card title="Datos de contacto">
          <ActionForm action={updateMyProfile} className="space-y-3">
            <Field label="Teléfono"><input name="phone" defaultValue={me.phone ?? ""} className={input} /></Field>
            <Field label="Sede"><input name="site" defaultValue={me.site ?? ""} className={input} /></Field>
            <SubmitButton className={btn.primary}>Guardar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
