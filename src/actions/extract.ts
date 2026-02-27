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

    if (!response.ok) {
      throw new Error("Local engine unreachable.");
    }

    return (await response.json()) as ExtractResponse;
  } catch {
    return {
      success: false,
      error: "OFFGRID_ENGINE_OFFLINE: Run 'python backend/server.py' to start.",
    };
  }
}
