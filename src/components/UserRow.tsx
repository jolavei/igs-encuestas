"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Company = { id: string; name: string };

export default function UserRow({
  user,
  companies,
  isSelf,
}: {
  user: { id: string; email: string; role: string; companyId: string | null; active: boolean };
  companies: Company[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [companyId, setCompanyId] = useState(user.companyId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={`border-t border-slate-100 ${!user.active ? "bg-slate-50 opacity-70" : ""}`}>
      <td className="px-4 py-2">
        {user.email}
        {!user.active && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            Desactivado
          </span>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-2">
        <select
          className="input"
          value={role}
          disabled={!user.active}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="ADMIN">ADMIN</option>
          <option value="SURVEYOR">SURVEYOR</option>
          <option value="CLIENT">CLIENT</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <select
          className="input"
          value={companyId}
          disabled={!user.active}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">— ninguna —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          {user.active && (
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => patch({ role, companyId: companyId || null })}
            >
              {busy ? "…" : "Guardar"}
            </button>
          )}
          <button
            className={
              user.active
                ? "inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                : "btn"
            }
            disabled={busy || (isSelf && user.active)}
            title={isSelf && user.active ? "No puedes desactivar tu propia cuenta" : undefined}
            onClick={() => patch({ active: !user.active })}
          >
            {user.active ? "Desactivar" : "Reactivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
