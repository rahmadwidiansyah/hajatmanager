import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  jwt: { maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { access_type: "offline", prompt: "consent" } },
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, account, profile }) {
      if (user) {
        const u = user as { id: string; username?: string | null; avatar?: string | null; profilePicture?: string | null; image?: string | null };
        token.id = u.id;
        if (u.username !== undefined) token.username = u.username;
        if (u.avatar !== undefined) token.avatar = u.avatar;
        if (u.profilePicture !== undefined) token.profilePicture = u.profilePicture;
        if (u.image) token.picture = u.image;
      }
      if (account?.provider === "google" && profile) {
        const p = profile as { picture?: string };
        if (p.picture) token.avatar = p.picture;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { username?: string | null }).username = token.username as string | null;
        (session.user as { avatar?: string | null }).avatar = token.avatar as string | null;
        (session.user as { profilePicture?: string | null }).profilePicture = token.profilePicture as string | null;
        if (token.picture) session.user.image = token.picture as string;
        if (token.avatar) (session.user as { avatar?: string | null }).avatar = token.avatar as string | null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile) {
        const p = profile as { picture?: string };
        if (p.picture) {
          await prisma.user.update({ where: { id: user.id }, data: { avatar: p.picture } }).catch(() => {});
        }
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
