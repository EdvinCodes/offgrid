import yt_dlp
import uvicorn
import requests
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="OffGrid Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractionRequest(BaseModel):
    url: str

@app.post("/extract")
async def extract_media(request: ExtractionRequest):
    print(f"[ENGINE] Ingesting URL: {request.url}")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "best",
        "nocheckcertificate": True,
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(request.url, download=False)
            if not info:
                raise ValueError("Could not extract data from target")

            # Si es carrusel/playlist de IG, coge el primer elemento
            if info.get("_type") == "playlist" and info.get("entries"):
                info = info["entries"][0]

            media_url = None
            media_type = "image"

            # 1) Intentar vídeo (reels, posts con vídeo)
            fmt = (info.get("format") or "").lower()
            is_video = info.get("ext") == "mp4" or "video" in fmt

            if is_video and "formats" in info:
                for f in info["formats"]:
                    # elegir mejor MP4 con vídeo
                    if f.get("ext") == "mp4" and f.get("vcodec") != "none":
                        media_url = f.get("url")
                        media_type = "video"
                        break

            # Fallback: si no se ha encontrado formato vídeo válido, usar url directa si es MP4
            if not media_url and is_video and info.get("url", "").startswith("http"):
                media_url = info["url"]
                media_type = "video"

            # 2) Si NO es vídeo o no se encontró vídeo, intentar imagen
            if not media_url:
                # Algunos extractores de IG exponen 'url' directamente como imagen
                if info.get("url", "").startswith("http") and info.get("ext") in ("jpg", "jpeg", "png", "webp", None):
                    media_url = info["url"]
                    media_type = "image"

                # Extra fallback: usar thumbnail como media principal si no hay otra cosa
                if not media_url and info.get("thumbnail", "").startswith("http"):
                    media_url = info["thumbnail"]
                    media_type = "image"

            if not media_url:
                # Aquí es donde antes te saldría “no valid media”: devolvemos error explícito
                return {
                    "success": False,
                    "error": "No valid media found for this post (video/image not resolvable).",
                }

            raw_desc = info.get("description") or info.get("title") or "No metadata provided."
            clean_desc = raw_desc.split("\n")[0][:120]

            return {
                "success": True,
                "type": media_type,
                "url": media_url,
                "thumbnail": info.get("thumbnail"),
                "description": clean_desc,
            }
    except Exception as e:
        err = str(e)
        print(f"[ERROR] {err}")

        # Mensajes un poco más claros según lo que diga yt-dlp
        if "login required" in err.lower():
            msg = "Login required for this Instagram content."
        elif "requested content is not available" in err.lower():
            msg = "Instagram says this content is unavailable or expired."
        elif "unsupported url" in err.lower():
            msg = "This Instagram URL type is not supported by the extractor."
        else:
            msg = "Object protected, expired or unsupported."

        return {"success": False, "error": msg}


@app.get("/proxy")
async def proxy_media(url: str = Query(..., description="Direct media URL")):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.instagram.com/",
    }
    try:
        r = requests.get(url, headers=headers, stream=True, timeout=15)
        r.raise_for_status()

        return StreamingResponse(
            r.iter_content(chunk_size=1024),
            media_type=r.headers.get("Content-Type", "application/octet-stream"),
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Proxy Tunnel Interrupted")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
