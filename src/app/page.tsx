import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  redirect(ROLE_HOME[session.role]);
}
