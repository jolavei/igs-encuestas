import AgaAcompanantesDashboard from "@/components/dashboard/survey/AgaAcompanantesDashboard";

// La autorización (ADMIN) la aplica el layout de /admin.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AgaAcompanantesDashboard />;
}
