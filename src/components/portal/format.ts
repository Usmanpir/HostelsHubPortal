import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { ResidentContext } from "@/lib/tenant/resident";

/** Server-side formatters bound to the resident's organization currency/locale/time zone. */
export function portalFormatters(ctx: Pick<ResidentContext, "organization">) {
  const { currency, locale, timezone } = ctx.organization;
  return {
    money: (n: number | null | undefined) => formatMoney(n, currency, locale),
    date: (d: Date | string | null | undefined) => formatDate(d, locale),
    dateTime: (d: Date | string | null | undefined) => formatDateTime(d, timezone, locale),
  };
}

export function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
