import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Markdown mínimo y seguro para respuestas de Ask ORKEST: párrafos, títulos, listas, tablas,
 * **negrita**, `código` y enlaces. Solo enlaza rutas internas (/…); nunca renderiza HTML.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(m[2].startsWith("/") && !m[2].startsWith("//") ? <Link key={`${key}-${i++}`} href={m[2]} className="font-medium text-[var(--ork-violet)] underline">{m[1]}</Link> : m[1]);
    else if (m[3]) out.push(<strong key={`${key}-${i++}`}>{m[3]}</strong>);
    else if (m[4]) out.push(<code key={`${key}-${i++}`} className="rounded bg-stone-100 px-1 text-[0.9em]">{m[4]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const cells = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      const num = (c: string) => /^[\s$%+-]*[\d.,]+\s*%?$/.test(c);
      blocks.push(
        <div key={i} className="my-3 overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left"><tr>{head.map((h, j) => <th key={j} className="px-3 py-2 font-semibold">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-stone-100">{r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${num(c) ? "text-right tabular-nums" : ""}`}>{inline(c, k * 100 + j)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { blocks.push(<p key={i} className="mt-3 font-semibold text-[var(--ork-purple)]">{inline(h[2], i)}</p>); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={i} className={`my-2 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((t, k) => <li key={k}>{inline(t, i * 100 + k)}</li>)}</Tag>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s+|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push(<p key={i} className="my-2 leading-relaxed">{inline(para.join(" "), i)}</p>);
  }
  return <div className="text-[15px] text-stone-800">{blocks}</div>;
}
