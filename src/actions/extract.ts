"use server";

const BASE = process.env.API_URL || "http://127.0.0.1:8000";
const ENGINE_URL = `${BASE}/extract`;

type ExtractResponse = {
  success: boolean;
  engine?: string;
  items?: Array<{
    type: "video" | "image" | "audio";
    url: string;
    thumbnail: string;
    description?: string;
  }>;
  error?: string;
};

function parseErrorBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const detail = record.detail ?? record.error;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : String(item),
      )
      .join(", ");
  }
  return undefined;
}

export async function extractMedia(
  url: string,
  formatType: "mp4" | "mp3" = "mp4",
): Promise<ExtractResponse> {
  try {
    const response = await fetch(ENGINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format_type: formatType }),
      cache: "no-store",
    });

    const data = (await response.json()) as ExtractResponse;

    if (!response.ok) {
      return {
        success: false,
        error:
          parseErrorBody(data) ||
          `Engine error (${response.status}).`,
      };
    }

    return data;
  } catch {
    return {
      success: false,
      error: "OFFGRID_ENGINE_OFFLINE: Run 'python backend/server.py' to start.",
    };
  }
}
