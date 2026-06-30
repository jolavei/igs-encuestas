import { prisma } from "@/lib/prisma";
import UserRow from "@/components/UserRow";
import PostForm from "@/components/PostForm";
import Fab from "@/components/Fab";
import { getSessionUser } from "@/lib/rbac";

export default async function UsuariosPage() {
  const [me, users, companies] = await Promise.all([
    getSessionUser(),
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    prisma.company.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Usuarios y roles</h1>
      <p className="text-slate-500">
        Agrega usuarios por correo (mantienen rol y empresa al iniciar sesión). Los
        usuarios desactivados no pueden ingresar pero conservan su historial.
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={{
                  id: u.id,
                  email: u.email,
                  role: u.role,
                  companyId: u.companyId,
                  active: u.active,
                }}
                companies={companies}
                isSelf={u.id === me?.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Fab title="Agregar usuario por correo">
        <PostForm
          endpoint="/api/users"
          submitLabel="Agregar"
          fields={[
            { name: "email", label: "Correo", required: true, placeholder: "persona@empresa.cl" },
            {
              name: "role",
              label: "Rol",
              type: "select",
              required: true,
              options: [
                { value: "SURVEYOR", label: "Encuestador" },
                { value: "CLIENT", label: "Cliente" },
                { value: "ADMIN", label: "Administrador" },
              ],
            },
            {
              name: "companyId",
              label: "Empresa (solo si es Cliente)",
              type: "select",
              options: companies.map((c) => ({ value: c.id, label: c.name })),
            },
          ]}
        />
      </Fab>
    </div>
  );
}
