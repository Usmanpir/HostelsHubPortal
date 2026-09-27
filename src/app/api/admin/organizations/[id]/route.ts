import { readJson } from "@/lib/api/handler";
import type { OrganizationStatusInput } from "@/lib/validation/admin";
import { getOrganizationDetail, setOrganizationStatus } from "@/services/admin/organization-service";
import { adminRoute } from "../../_lib/handler";

type Params = { id: string };

/** GET /api/admin/organizations/:id — metadata, subscription and aggregate usage. */
export const GET = adminRoute<Params>(async ({ params, ctx }) => getOrganizationDetail(ctx, params.id));

/** PATCH /api/admin/organizations/:id { status: "ACTIVE" | "SUSPENDED", reason? } */
export const PATCH = adminRoute<Params>(async ({ req, params, ctx }) => {
  await setOrganizationStatus(ctx, params.id, (await readJson(req)) as OrganizationStatusInput);
  return getOrganizationDetail(ctx, params.id);
});
