"use client";
import { useState } from "react";

export type ResponseRow = {
  id: string;
  date: string;
  questionnaire: string;
  place: string;
  source: string;
};

const PAGE = 10;

export default function LatestResponses({ rows }: { rows: ResponseRow[] }) {
  const [visible, setVisible] = useState(PAGE);
  const shown = rows.slice(0, visible);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Cuestionario</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Empresa · Sede</th>
              <th className="px-4 py-2 font-medium">Origen</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.date}</td>
                <td className="px-4 py-2 font-medium">{r.questionnaire}</td>
                <td className="hidden px-4 py-2 text-slate-600 sm:table-cell">{r.place}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {r.source}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                  Aún no hay respuestas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {visible < rows.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="btn-secondary"
          >
            Mostrar más
          </button>
        </div>
      )}
    </div>
  );
}
