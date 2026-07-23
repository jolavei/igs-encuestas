"use client";
import { useState } from "react";
import SurveyRunner from "@/components/SurveyRunner";
import SurveyFooter from "@/components/SurveyFooter";
import type { ClientSection } from "@/components/QuestionInput";

// Levantamiento ligado a un plan. Si el plan no fija sede, se elige aquí.
export default function FieldSurvey({
  workPlanId,
  title,
  subtitle,
  sections,
  locations,
}: {
  workPlanId: string;
  title: string;
  subtitle?: string;
  sections: ClientSection[];
  locations?: { id: string; name: string }[]; // si viene, hay que elegir sede
}) {
  const [locationId, setLocationId] = useState("");
  const needsLocation = !!locations && locations.length > 0;

  if (needsLocation && !locationId) {
    return (
      <div className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <div className="pt-5">
          <label className="mb-1 block text-[15px] font-medium text-slate-800">
            Elige la sede para comenzar
          </label>
          <select
            className="input"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">— elegir sede —</option>
            {locations!.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <SurveyFooter />
      </div>
    );
  }

  return (
    <SurveyRunner
      sections={sections}
      endpoint="/api/responses"
      title={title}
      subtitle={needsLocation ? locations!.find((l) => l.id === locationId)?.name : subtitle}
      offline
      allowFileUpload
      extra={{ workPlanId, ...(needsLocation ? { locationId } : {}) }}
    />
  );
}
