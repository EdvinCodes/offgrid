"use server";

import axios from "axios";

export async function extractMedia(url: string) {
  try {
    // 1. Validación básica
    if (!url.includes("instagram.com/") && !url.includes("instagr.am/")) {
      return {
        success: false,
        error: "URL inválida. Usa un enlace de Instagram.",
      };
    }

    // 2. LA LLAVE MAESTRA (Pon aquí la tuya REAL)
    const RAPIDAPI_KEY = "6a4a2f05c8mshc1fd115326e5eb6p1b4a0cjsn7e7d7d841d36";

    console.log("💎 Conectando a Instagram Reels Downloader API...", url);

    // 3. Petición a la API que has elegido
    const options = {
      method: "GET",
      url: "https://instagram-reels-downloader-api.p.rapidapi.com/download",
      params: { url: url },
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "instagram-reels-downloader-api.p.rapidapi.com",
      },
    };

    const response = await axios.request(options);
    const apiResponse = response.data; // El JSON completo

    // 4. Procesar la respuesta según el JSON que me has pasado
    if (!apiResponse.success || !apiResponse.data) {
      return { success: false, error: "Contenido privado o eliminado." };
    }

    const data = apiResponse.data;

    // El video suele ser el primero del array 'medias'
    // Buscamos el que sea type="video" y tenga mayor calidad si hay varios
    const videoObj = data.medias?.find((m: any) => m.type === "video");
    const imageObj = data.medias?.find((m: any) => m.type === "image");

    let downloadUrl = "";
    let type: "video" | "image" = "image";

    if (videoObj) {
      type = "video";
      downloadUrl = videoObj.url;
    } else if (imageObj) {
      type = "image";
      downloadUrl = imageObj.url;
    } else {
      // Fallback por si acaso medias viene vacío pero data.url existe
      downloadUrl = data.url;
    }

    return {
      success: true,
      type: type,
      url: downloadUrl, // ESTE es el enlace limpio (fhan15-2.fna.fbcdn.net...)
      thumbnail: data.thumbnail, // La miniatura HD que viene en el root
      description: data.title || "Instagram Media Object",
    };
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);

    if (error.response?.status === 429) {
      return { success: false, error: "Límite mensual gratuito excedido." };
    }

    return { success: false, error: "Error de conexión con la API Premium." };
  }
}
