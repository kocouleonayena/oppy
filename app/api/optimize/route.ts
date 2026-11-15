import { paidFeatureUnavailable } from "@/lib/pilotAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() { return paidFeatureUnavailable(); }
