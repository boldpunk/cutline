import type { Metadata } from "next";
import { SuccessView } from "@/components/booking/SuccessView";

export const metadata: Metadata = { title: "Готово" };

export default function SuccessPage() {
  return <SuccessView />;
}
