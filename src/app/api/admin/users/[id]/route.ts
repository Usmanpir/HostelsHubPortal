import { z } from "zod";
import { readJson } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { parseInput } from "@/lib/validation/parse";
import { setSuperAdmin, setUserStatus } from "@/services/admin/user-service";
import { adminRoute } from "../../_lib/handler";

const bodySchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  isSuperAdmin: z.boolean().optional(),
});

/** PATCH /api/admin/users/:id { status?: "ACTIVE" | "DISABLED", isSuperAdmin?: boolean } */
export const PATCH = adminRoute<{ id: string }>(async ({ req, params, ctx }) => {
  const body = parseInput(bodySchema, await readJson(req));
  if (body.status === undefined && body.isSuperAdmin === undefined) throw new ValidationError("Nothing to update.");
  if (body.status !== undefined) await setUserStatus(ctx, params.id, { status: body.status });
  if (body.isSuperAdmin !== undefined) await setSuperAdmin(ctx, params.id, { isSuperAdmin: body.isSuperAdmin });
  return null;
});
