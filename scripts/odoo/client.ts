/**
 * Cliente XML-RPC de Odoo de SOLO LECTURA.
 * Cualquier método fuera de READ_METHODS lanza error antes de llamar a Odoo:
 * esta copia nunca puede crear, modificar ni borrar nada en el Odoo de origen.
 */
const READ_METHODS = new Set(["search_read", "search_count", "read", "fields_get", "search", "read_group"]);

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k} (usa --env-file=.env.odoo)`);
  return v;
};

function toXml(v: unknown): string {
  if (v === null || v === undefined) return "<value><boolean>0</boolean></value>";
  if (typeof v === "boolean") return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (typeof v === "number") return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`;
  if (typeof v === "string") return `<value><string>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string></value>`;
  if (Array.isArray(v)) return `<value><array><data>${v.map(toXml).join("")}</data></array></value>`;
  return `<value><struct>${Object.entries(v as object).map(([k, x]) => `<member><name>${k}</name>${toXml(x)}</member>`).join("")}</struct></value>`;
}

// Parser XML-RPC mínimo (respuestas de Odoo)
function parse(xml: string): unknown {
  let i = 0;
  const tag = () => { const m = /<\/?([a-zA-Z0-9.]+)\s*\/?>/g; m.lastIndex = i; const r = m.exec(xml)!; i = m.lastIndex; return { name: r[1], close: r[0][1] === "/", self: r[0].endsWith("/>"), start: r.index }; };
  const text = (end: string) => { const j = xml.indexOf(`</${end}>`, i); const t = xml.slice(i, j); i = j + end.length + 3; return t; };
  const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  function value(): unknown {
    // ya consumido <value>
    const save = i; const t = tag();
    if (t.close) { const s = unesc(xml.slice(save, t.start)); return s; } // </value> → string implícito
    let out: unknown;
    switch (t.name) {
      case "string": out = t.self ? "" : unesc(text("string")); break;
      case "int": case "i4": case "i8": out = Number(text(t.name)); break;
      case "double": out = Number(text("double")); break;
      case "boolean": out = text("boolean").trim() === "1"; break;
      case "nil": out = null; break;
      case "dateTime.iso8601": out = text(t.name); break;
      case "array": { tag(); const arr: unknown[] = []; for (;;) { const n = tag(); if (n.close) break; arr.push(value()); } tag(); out = arr; break; }
      case "struct": { const o: Record<string, unknown> = {}; for (;;) { const n = tag(); if (n.close) break; tag(); const k = text("name"); tag(); o[k] = value(); tag(); } out = o; break; }
      default: throw new Error("XML-RPC: tipo " + t.name);
    }
    tag(); // </value>
    return out;
  }
  if (xml.includes("<fault>")) { i = xml.indexOf("<value>") + 7; const f = value() as { faultString: string }; throw new Error("Odoo: " + f.faultString.split("\n").slice(-2).join(" ")); }
  i = xml.indexOf("<value>") + 7;
  return value();
}

async function call(path: string, method: string, params: unknown[]) {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map((p) => `<param>${toXml(p)}</param>`).join("")}</params></methodCall>`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(env("ODOO_URL") + path, { method: "POST", headers: { "content-type": "text/xml" }, body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(await res.text());
    } catch (e) {
      if (attempt >= 4 || String(e).startsWith("Error: Odoo:")) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

let uid: number | undefined;
export async function odoo<T = unknown>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
  if (!READ_METHODS.has(method)) throw new Error(`Bloqueado: '${method}' no es de lectura. Esta copia es solo lectura.`);
  uid ??= (await call("/xmlrpc/2/common", "authenticate", [env("ODOO_DB"), env("ODOO_USER"), env("ODOO_KEY"), {}])) as number;
  if (!uid) throw new Error("Odoo: autenticación fallida");
  return (await call("/xmlrpc/2/object", "execute_kw", [env("ODOO_DB"), uid, env("ODOO_KEY"), model, method, args, kwargs])) as T;
}

/** Lee todos los registros por páginas. */
export async function readAll<T = Record<string, unknown>>(model: string, domain: unknown[], fields: string[], opts: { pageSize?: number; context?: object } = {}) {
  const size = opts.pageSize ?? 2000, out: T[] = [];
  for (let offset = 0; ; offset += size) {
    const page = await odoo<T[]>(model, "search_read", [domain], { fields, offset, limit: size, order: "id", context: { active_test: false, ...opts.context } });
    out.push(...page);
    if (page.length < size) return out;
  }
}
