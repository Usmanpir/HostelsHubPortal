import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/handler";
import { checkOutVisitor } from "@/services/operations/visitor-service";

type Params = { id: string };

/** POST /api/visitors/[id]/check-out → 200 with the updated visitor. */
export const POST = tenantRoute<Params>(async ({ params, ctx }) =>
  NextResponse.json({ data: await checkOutVisitor(ctx, params.id) }, { status: 200 }),
);
