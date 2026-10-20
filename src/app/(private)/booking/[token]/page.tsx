import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccessForm } from "@/components/booking/AccessForm";
import { ManageBooking } from "@/components/booking/ManageBooking";
import { DemoBanner } from "@/components/site/DemoBanner";
import { todayIn } from "@/lib/domain/time";
import { checkGrant, findBookingIdByToken, grantCookieName } from "@/lib/server/client-access";
import { clientBookingView } from "@/lib/server/client-booking";
import { env } from "@/lib/server/env";
import { publicConfig } from "@/lib/server/public-data";

export const metadata: Metadata = { title: "Ваша запись" };

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findBookingIdByToken(token);
  if (!found) notFound();
  const granted = checkGrant((await cookies()).get(grantCookieName(found.tokenHash))?.value, found.id);

  if (!granted) {
    // Before verification: nothing about the booking, the client or even the salon is shown.
    return <AccessForm token={token} />;
  }
  const view = await clientBookingView(found.id);
  if (!view) notFound();
  const { salon, ...booking } = view;
  return (
    <>
      <div className="-mx-4 -mt-10 mb-8">
        <DemoBanner mode={salon.mode} />
      </div>
      <ManageBooking
        token={token}
        manageUrl={`${env.appUrl}/booking/${token}`}
        view={booking}
        config={publicConfig(salon)}
        today={todayIn(salon.timezone)}
      />
    </>
  );
}
