import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccessForm } from "@/components/booking/AccessForm";
import { ManageBooking } from "@/components/booking/ManageBooking";
import { todayIn } from "@/lib/domain/time";
import { checkGrant, findBookingIdByToken, grantCookieName } from "@/lib/server/client-access";
import { clientBookingView } from "@/lib/server/client-booking";
import { env } from "@/lib/server/env";
import { getPublicSettings, publicConfig } from "@/lib/server/public-data";

export const metadata: Metadata = { title: "Ваша запись" };

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findBookingIdByToken(token);
  if (!found) notFound();
  const settings = await getPublicSettings();
  const granted = checkGrant((await cookies()).get(grantCookieName(found.tokenHash))?.value, found.id);

  if (!granted) {
    // Before verification: nothing about the booking or the client is shown.
    return <AccessForm token={token} salonName={settings.name} />;
  }
  const view = await clientBookingView(found.id, settings);
  if (!view) notFound();
  return (
    <ManageBooking
      token={token}
      manageUrl={`${env.appUrl}/booking/${token}`}
      view={view}
      config={publicConfig(settings)}
      today={todayIn(settings.timezone)}
    />
  );
}
