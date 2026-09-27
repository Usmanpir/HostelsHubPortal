import { readJson, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import {
  cancelPayroll,
  getPayslip,
  payPayroll,
  reopenPayroll,
  updatePayroll,
} from "@/services/staff/payroll-service";
import type { PayrollComponentsInput, PayrollPayInput } from "@/lib/validation/staff";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getPayslip(ctx, params.id));

/**
 * PATCH /api/payroll/:id
 *   { "action": "update", baseSalary, allowances, bonus, deductions, advances, notes? }
 *   { "action": "pay", paymentDate, paymentMethod, reference?, notes? }
 *   { "action": "cancel" } | { "action": "reopen" }
 */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = (await readJson(req)) as ({ action?: unknown } & Record<string, unknown>) | null;
  const { action, ...rest } = body ?? {};
  switch (action) {
    case "update":
      return updatePayroll(ctx, params.id, rest as PayrollComponentsInput);
    case "pay":
      return payPayroll(ctx, params.id, rest as PayrollPayInput);
    case "cancel":
      await cancelPayroll(ctx, params.id);
      return getPayslip(ctx, params.id);
    case "reopen":
      await reopenPayroll(ctx, params.id);
      return getPayslip(ctx, params.id);
    default:
      throw new ValidationError('Provide "action": "update", "pay", "cancel" or "reopen".');
  }
});
