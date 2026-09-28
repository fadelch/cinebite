import { apiError } from "@/server/http/api-response";
import { getSeatQrImage } from "@/server/services/seat-qr.service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ locationId: string; hallId: string; seatId: string }> }) {
  try {
    const { locationId, hallId, seatId } = await context.params;
    const image = await getSeatQrImage(locationId, hallId, seatId);
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private,no-store,max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return apiError(error); }
}
