"use client";
import { useState } from "react";
import SurveyRunner from "@/components/SurveyRunner";
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
      <div className="card space-y-3">
        <h1 className="text-xl font-bold">{title}</h1>
        <div>
          <label className="label">Elige la sede para comenzar</label>
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
