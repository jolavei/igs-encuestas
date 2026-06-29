import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/enums";

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Login de desarrollo: solo email, sin password. NUNCA en produccion.
if (process.env.ENABLE_DEV_LOGIN === "true") {
  providers.push(
    CredentialsProvider({
      id: "dev",
      name: "Dev (solo email)",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = creds?.email?.toLowerCase().trim();
        if (!email) return null;
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: email.split("@")[0],
            role:
              email === process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase()
                ? "ADMIN"
                : "SURVEYOR",
          },
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Bloquea el ingreso de usuarios desactivados.
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (dbUser && !dbUser.active) return false; // usuario antiguo desactivado
      return true;
    },
    async jwt({ token, user }) {
      // Resolver rol SIEMPRE desde la DB (nunca confiar en el cliente).
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (!email) return token;

      let dbUser = await prisma.user.findUnique({ where: { email } });

      // Bootstrap del primer admin.
      if (
        dbUser &&
        email === process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase() &&
        dbUser.role !== "ADMIN"
      ) {
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: { role: "ADMIN" },
        });
      }

      if (dbUser && dbUser.active) {
        token.uid = dbUser.id;
        token.role = dbUser.role as Role;
        token.companyId = dbUser.companyId ?? null;
      } else if (dbUser && !dbUser.active) {
        // Desactivado: revoca rol en sesiones ya emitidas (queda sin acceso a rutas por rol).
        token.uid = dbUser.id;
        token.role = undefined;
        token.companyId = null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.companyId = (token.companyId as string | null) ?? null;
      }
      return session;
    },
  },
};
