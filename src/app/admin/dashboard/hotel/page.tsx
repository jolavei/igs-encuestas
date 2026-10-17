import HotelDashboard from "@/components/dashboard/survey/HotelDashboard";

// La autorización (ADMIN) la aplica el layout de /admin.
export const dynamic = "force-dynamic";

export default function Page() {
  return <HotelDashboard />;
}
