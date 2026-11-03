/** Etiquetas y tonos de la app Talento humano. */
type L = Record<string, string>;
type T = Record<string, { label: string; tone: string }>;

export const REQUEST_STATUS: T = {
  PENDING: { label: "Pendiente", tone: "amber" }, APPROVED: { label: "Aprobada", tone: "emerald" },
  REJECTED: { label: "Rechazada", tone: "rose" }, CANCELLED: { label: "Cancelada", tone: "slate" },
};
export const TIME_OFF_TYPE: L = { VACATION: "Vacaciones", PERMIT: "Permiso", LEAVE: "Licencia", INCAPACITY: "Incapacidad", UNPAID: "No remunerada" };
export const PERMIT_SUBTYPE: L = {
  CITA_MEDICA: "Cita médica", CALAMIDAD_DOMESTICA: "Calamidad doméstica", LUTO: "Licencia de luto", MATERNIDAD: "Maternidad",
  PATERNIDAD: "Paternidad", DILIGENCIA_JUDICIAL: "Diligencia judicial", SINDICAL: "Sindical", ESTUDIO: "Estudio",
  PERSONAL: "Personal", NO_REMUNERADO: "No remunerado", MEDIO_DIA: "Medio día", HORAS: "Por horas", OTRO: "Otro",
};
export const INCAPACITY_TYPE: L = {
  ENFERMEDAD_GENERAL: "Enfermedad general", ACCIDENTE_LABORAL: "Accidente laboral", ENFERMEDAD_LABORAL: "Enfermedad laboral",
  MATERNIDAD: "Licencia de maternidad", PATERNIDAD: "Licencia de paternidad",
};
export const OVERTIME_TYPE: L = {
  DIURNA: "Diurna", NOCTURNA: "Nocturna", DOMINICAL_FESTIVA_DIURNA: "Dominical/festiva diurna", DOMINICAL_FESTIVA_NOCTURNA: "Dominical/festiva nocturna",
};
/** Recargos sobre la hora ordinaria (Código Sustantivo del Trabajo, Colombia). Solo referencia en la ayuda. */
export const OVERTIME_SURCHARGE: Record<string, number> = { DIURNA: 25, NOCTURNA: 75, DOMINICAL_FESTIVA_DIURNA: 100, DOMINICAL_FESTIVA_NOCTURNA: 150 };
export const CONTRACT_TYPE: L = {
  INDEFINITE: "Término indefinido", FIXED_TERM: "Término fijo", WORK_OR_LABOR: "Obra o labor", APPRENTICESHIP: "Aprendizaje",
  TEMPORARY: "Temporal", CIVIL: "Prestación de servicios",
};
export const EMPLOYEE_STATUS: T = {
  ACTIVE: { label: "Activo", tone: "emerald" }, ON_LEAVE: { label: "En licencia", tone: "amber" }, TERMINATED: { label: "Retirado", tone: "slate" },
};
export const SALARY_PERIOD: L = { MONTHLY: "Mensual", BIWEEKLY: "Quincenal", HOURLY: "Por hora" };
export const ATTENDANCE_STATUS: T = {
  PRESENT: { label: "Presente", tone: "emerald" }, LATE: { label: "Tarde", tone: "amber" }, ABSENT: { label: "Ausente", tone: "rose" },
};
export const ANNOUNCEMENT_CATEGORY: L = {
  GENERAL: "General", RRHH: "Talento humano", EVENTOS: "Eventos", BIENESTAR: "Bienestar", TECNOLOGIA: "Tecnología",
  SST: "Seguridad y salud", COMERCIAL: "Comercial", PRODUCCION: "Producción",
};
export const CANDIDATE_STAGE: T = {
  POSTULADO: { label: "Postulado", tone: "slate" }, ENTREVISTA: { label: "Entrevista", tone: "blue" }, PRUEBA: { label: "Prueba", tone: "indigo" },
  OFERTA: { label: "Oferta", tone: "violet" }, CONTRATADO: { label: "Contratado", tone: "emerald" }, DESCARTADO: { label: "Descartado", tone: "rose" },
};
export const NOTE_TYPE: T = {
  SEGUIMIENTO: { label: "Seguimiento", tone: "blue" }, LLAMADO_ATENCION: { label: "Llamado de atención", tone: "rose" },
  RECONOCIMIENTO: { label: "Reconocimiento", tone: "emerald" }, OTRO: { label: "Otro", tone: "slate" },
};
export const ASSET_TYPE: L = {
  COMPUTO: "Cómputo", MOVIL: "Móvil", UNIFORME: "Uniforme", EPP: "EPP", HERRAMIENTA: "Herramienta", MOBILIARIO: "Mobiliario", VEHICULO: "Vehículo", OTRO: "Otro",
};
export const ASSET_STATUS: T = {
  ENTREGADO: { label: "Entregado", tone: "blue" }, DEVUELTO: { label: "Devuelto", tone: "emerald" },
  DANADO: { label: "Dañado", tone: "amber" }, PERDIDO: { label: "Perdido", tone: "rose" },
};
export const DOCUMENT_CATEGORY: L = { CONTRATO: "Contrato", CERTIFICADO: "Certificado", COMPROBANTE_PAGO: "Comprobante de pago", OTRO: "Otro" };
export const BENEFIT_CATEGORY: L = {
  SALUD: "Salud", EDUCACION: "Educación", BIENESTAR: "Bienestar", CONVENIOS: "Convenios", BONIFICACIONES: "Bonificaciones",
  RECONOCIMIENTOS: "Reconocimientos", OTRO: "Otro",
};
export const TICKET_STATUS: T = {
  PENDIENTE: { label: "Pendiente", tone: "amber" }, EN_PROCESO: { label: "En proceso", tone: "blue" },
  ESPERANDO_RESPUESTA: { label: "Esperando respuesta", tone: "violet" }, FINALIZADO: { label: "Finalizado", tone: "emerald" },
  CANCELADO: { label: "Cancelado", tone: "slate" },
};
export const TICKET_PRIORITY: T = {
  BAJA: { label: "Baja", tone: "slate" }, MEDIA: { label: "Media", tone: "blue" }, ALTA: { label: "Alta", tone: "amber" }, URGENTE: { label: "Urgente", tone: "rose" },
};
export const TICKET_EVENT: L = {
  CREATED: "creó la solicitud", STATUS: "cambió el estado", PRIORITY: "cambió la prioridad", RESPONSIBLE: "cambió el responsable",
  COMMENT: "comentó", ATTACHMENT: "adjuntó un archivo", EDITED: "editó",
};

export const opts = (m: L) => Object.entries(m).map(([value, label]) => ({ value, label }));
export const optsT = (m: T) => Object.entries(m).map(([value, v]) => ({ value, label: v.label }));
