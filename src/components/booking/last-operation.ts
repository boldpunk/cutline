// Result of the last successful booking operation, handed to /booking/success
// through sessionStorage so no personal data or token ever goes into a URL.
export const LAST_OPERATION_KEY = "cutline:last-operation";

export type LastOperation = {
  kind: "created" | "rescheduled" | "cancelled";
  code: string;
  manageUrl: string | null;
  startAt: string;
  endAt: string;
  serviceName: string;
  priceUzs: number;
  durationMin: number;
  barberName: string;
  timezone: string;
  salonName: string;
  address: string | null;
  demo: boolean;
  cancelCutoffHours: number;
  emailSent: boolean;
};
