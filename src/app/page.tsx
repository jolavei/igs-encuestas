import { redirect } from "next/navigation";
import { getSessionUser, homePathForRole } from "@/lib/rbac";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(homePathForRole(user.role));
}
