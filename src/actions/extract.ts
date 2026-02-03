"use server";

const ENGINE_URL = "http://127.0.0.1:8000/extract";

type ExtractResponse = {
  success: boolean;
  type?: "video" | "image";
  url?: string;
  thumbnail?: string;
  description?: string;
  error?: string;
};

export async function extractMedia(url: string): Promise<ExtractResponse> {
  try {
    const response = await fetch(ENGINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Local engine unreachable.");
    }

    const data = (await response.json()) as ExtractResponse;
    return data;
  } catch {
    return {
      success: false,
      error: "OFFGRID_ENGINE_OFFLINE: Run 'python backend/server.py' to start.",
    };
  }
}
