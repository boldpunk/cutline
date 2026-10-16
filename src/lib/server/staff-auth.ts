// Staff authentication glue for Server Components and Server Actions.
// Every staff page and action calls requireStaff()/requireAdmin(); hidden
// buttons are never the only protection.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { StaffActor } from "./schedule-admin";
import { SESSION_COOKIE, userForSession, type StaffUser } from "./sessions";

export const getStaff = cache(async (): Promise<StaffUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(token);
});

export async function requireStaff(): Promise<StaffUser> {
  const user = await getStaff();
  if (!user) redirect("/staff");
  return user;
}

export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  // 404 rather than 403: don't advertise admin-only pages to barbers.
  if (user.role !== "admin") notFound();
  return user;
}

export function actorOf(user: StaffUser): StaffActor {
  return { type: "staff", userId: user.id, role: user.role, barberId: user.barberId };
}
