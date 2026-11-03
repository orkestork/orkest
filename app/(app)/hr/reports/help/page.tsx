import { requireModule } from "@/lib/core/context";
import { Card, PageHeader, Table, td } from "@/components/ui";
import { TICKET_SLA_HOURS, TICKET_SLA_LABELS, VACATION_DAYS_PER_YEAR } from "@/lib/apps/hr";
import { OVERTIME_SURCHARGE, OVERTIME_TYPE, TICKET_PRIORITY } from "@/lib/ui/hr-labels";
import { Tabs } from "../../_ui";

export const metadata = { title: "Cómo funciona talento humano" };

const RULES: [string, string][] = [
  ["Vacaciones", `Se causan ${VACATION_DAYS_PER_YEAR} días por cada 365 trabajados desde la fecha de ingreso. Disponibles = causados − aprobados − pendientes. No se puede pedir más de lo disponible ni cruzar fechas con otra ausencia pendiente o aprobada.`],
  ["Fechas pasadas", "Vacaciones, permisos y licencias no se pueden solicitar hacia atrás desde el portal. Las incapacidades sí (se reportan después de ocurrir) y exigen soporte. Talento humano puede registrar cualquier ausencia con fecha pasada."],
  ["Quién aprueba", "Talento humano (permiso «Aprobar solicitudes») o el jefe inmediato del colaborador, desde la Bandeja o desde «Equipo» en el portal. Rechazar exige motivo; aprobar un permiso exige indicar si es remunerado."],
  ["Incapacidades", "Reciben un consecutivo INC-AAAA-0001 por año. Guardan EPS, médico, diagnóstico y código CIE-10."],
  ["Permisos por horas", "Se registran con hora de salida y regreso; no descuentan días."],
  ["Horas extras", "Se reportan después de trabajarlas, con hora inicial y final; las horas se calculan solas."],
  ["Certificados laborales", "El colaborador lo solicita con o sin salario; al aprobarlo talento humano, lo descarga e imprime desde su portal con los datos legales de la empresa."],
  ["Centro de solicitudes", "Cada solicitud recibe un código TK-000001, responsable por defecto según la categoría y fecha límite según la prioridad. Si la categoría está limitada a un solo departamento, el solicitante puede elegir responsable de ese departamento."],
  ["Archivos", "Soportes, documentos, desprendibles y hojas de vida solo los abre quien tiene permiso sobre ese registro (o el propio colaborador). Máximo 8 MB por archivo."],
  ["Acceso al portal", "Al vincular un colaborador puedes crearle usuario con rol Colaborador; su contraseña inicial es su documento."],
];

export default async function Help() {
  await requireModule("hr", "hr.employees.read");
  return (
    <>
      <PageHeader title="Cómo funciona" subtitle="Reglas que aplica el sistema y valores de referencia." />
      <Tabs active="/hr/reports/help" items={[{ label: "Reportes", href: "/hr/reports" }, { label: "Cómo funciona", href: "/hr/reports/help" }]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Reglas que aplica el sistema" className="lg:col-span-2">
          <dl className="space-y-4">{RULES.map(([k, v]) => <div key={k}><dt className="text-sm font-medium">{k}</dt><dd className="text-sm text-slate-600">{v}</dd></div>)}</dl>
        </Card>
        <div className="space-y-6">
          <Card title="Tiempos de respuesta (SLA)" padded={false}>
            <Table head={["Prioridad", "Plazo"]}>
              {Object.keys(TICKET_SLA_HOURS).map((p) => <tr key={p}><td className={td}>{TICKET_PRIORITY[p].label}</td><td className={td}>{TICKET_SLA_LABELS[p]} ({TICKET_SLA_HOURS[p]} h)</td></tr>)}
            </Table>
          </Card>
          <Card title="Recargos de horas extra (referencia)" padded={false}>
            <Table head={["Tipo", "Recargo"]}>
              {Object.keys(OVERTIME_TYPE).map((t) => <tr key={t}><td className={td}>{OVERTIME_TYPE[t]}</td><td className={td}>+{OVERTIME_SURCHARGE[t]}%</td></tr>)}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
