import type { NextAuthOptions } from "next-auth";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/enums";

// Yahoo no viene incluido en next-auth v4 (sí en Auth.js v5), así que lo
// definimos a mano. Es un proveedor OpenID Connect estándar: el `wellKnown`
// publica authorization/token/userinfo, y `claims_supported` incluye `email` y
// `email_verified`, por lo que el id_token basta y no hace falta userinfo.
// Ojo: el token de Yahoo trae extras fuera del esquema (p. ej.
// `xoauth_yahoo_guid`); el filtro de `buildAdapter` ya los descarta.
interface YahooProfile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
}

function YahooProvider(
  options: OAuthUserConfig<YahooProfile>
): OAuthConfig<YahooProfile> {
  return {
    id: "yahoo",
    name: "Yahoo",
    type: "oauth",
    wellKnown: "https://api.login.yahoo.com/.well-known/openid-configuration",
    authorization: { params: { scope: "openid profile email" } },
    idToken: true,
    // Yahoo exige `nonce` en el flujo OIDC y lo devuelve en el id_token.
    checks: ["state", "nonce"],
    // Yahoo no anuncia PKCE (no hay `code_challenge_methods_supported` en su
    // discovery) y autentica el cliente por Basic en el token endpoint.
    // `id_token_signed_response_alg: ES256`: Yahoo firma el id_token con ES256,
    // pero openid-client espera RS256 por defecto y lo rechaza con
    // "unexpected JWT alg received, expected RS256, got: ES256". Le decimos que
    // acepte ES256 (algoritmo que Yahoo publica en su discovery).
    client: {
      token_endpoint_auth_method: "client_secret_basic",
      id_token_signed_response_alg: "ES256",
    },
    profile(profile) {
      const fullName =
        profile.name ??
        [profile.given_name, profile.family_name].filter(Boolean).join(" ");
      return {
        id: profile.sub,
        name: fullName || null,
        email: profile.email ?? null,
        image: null,
      };
    },
    options,
  };
}

// PrismaAdapter con un `linkAccount` "a prueba de campos extra". Azure AD /
// Entra ID devuelve en el token campos que NO existen como columna en la tabla
// Account (p. ej. `ext_expires_in`). NextAuth arma la cuenta con `...tokens`
// (core/lib/oauth/callback.js), así que esos extras llegan a Prisma y hacen
// fallar el vínculo de una 2ª forma de acceso (error=Callback) — típicamente al
// entrar con Microsoft a un correo que ya estaba ligado a Google. Filtramos a
// solo las columnas del esquema.
function buildAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    linkAccount: (account: AdapterAccount) =>
      prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state,
        },
      }) as unknown as ReturnType<NonNullable<Adapter["linkAccount"]>>,
  };
}

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Permite vincular el login de Google a un usuario pre-registrado por email
      // (admin lo crea en "Usuarios y roles" antes de su primer ingreso). Seguro
      // porque Google verifica el email.
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      // "common" = cualquier cuenta Microsoft; pon el ID del tenant de la
      // organización para restringir solo a sus cuentas. La lista blanca por
      // email (callback signIn) protege igual cuál sea el valor.
      tenantId: process.env.AZURE_AD_TENANT_ID,
      // Igual que Google: permite vincular el login de Microsoft a un usuario
      // pre-registrado por email. Microsoft verifica el email de las cuentas
      // organizacionales.
      allowDangerousEmailAccountLinking: true,
      // El claim de email de Entra ID a veces viene en `preferred_username`
      // (UPN) en vez de `email`; usamos el que exista para no perder el correo
      // con el que la lista blanca autoriza al usuario.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email ?? profile.preferred_username ?? null,
          image: null,
        };
      },
    })
  );
}

if (process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET) {
  providers.push(
    YahooProvider({
      clientId: process.env.YAHOO_CLIENT_ID,
      clientSecret: process.env.YAHOO_CLIENT_SECRET,
      // Igual que Google y Microsoft: permite vincular el login de Yahoo a un
      // usuario pre-registrado por email. Yahoo verifica el email de la cuenta.
      allowDangerousEmailAccountLinking: true,
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
  adapter: buildAdapter(),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Lista blanca: solo entran usuarios PRE-REGISTRADOS y activos.
    // Cualquier otro correo (aunque tenga Google) queda fuera -> "AccessDenied".
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email) return false;
      // El admin bootstrap siempre puede entrar (aunque aún no tenga registro).
      if (email === process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase()) return true;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser) return false; // no registrado por un admin
      if (!dbUser.active) return false; // usuario desactivado
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
        token.locationId = dbUser.locationId ?? null;
        // Nombre mostrado = Nombre + Apellidos definidos por el admin (fuente única);
        // si no están, cae al nombre del proveedor OAuth.
        const fullName = [dbUser.firstName, dbUser.lastName].filter(Boolean).join(" ").trim();
        token.name = fullName || dbUser.name || token.name;
      } else if (dbUser && !dbUser.active) {
        // Desactivado: revoca rol en sesiones ya emitidas (queda sin acceso a rutas por rol).
        token.uid = dbUser.id;
        token.role = undefined;
        token.companyId = null;
        token.locationId = null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.companyId = (token.companyId as string | null) ?? null;
        session.user.locationId = (token.locationId as string | null) ?? null;
      }
      return session;
    },
  },
};
