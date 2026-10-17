import AgaPasajerosDashboard from "@/components/dashboard/survey/AgaPasajerosDashboard";

// La autorización (ADMIN) la aplica el layout de /admin.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AgaPasajerosDashboard />;
}
