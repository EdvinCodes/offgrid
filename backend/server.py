import yt_dlp
import uvicorn
import instaloader
import os
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from urllib.parse import urlparse
from typing import Optional

# ─── DOMINIOS PERMITIDOS ────────────────────────────────────────────────────
# Para el proxy (CDN de Instagram/Facebook)
ALLOWED_CDN_DOMAINS = [
    ".cdninstagram.com", ".instagram.com", ".fbcdn.net",
]

# Para el input del usuario en /extract
ALLOWED_INPUT_DOMAINS = ["instagram.com", "www.instagram.com"]


def is_valid_cdn_url(url: str) -> bool:
    """Valida que la URL del proxy sea de un CDN de Instagram (anti-SSRF)."""
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        return parsed.scheme in ("http", "https") and any(
            netloc.endswith(d) for d in ALLOWED_CDN_DOMAINS
        )
    except Exception:
        return False


# ─── APP ────────────────────────────────────────────────────────────────────
app = FastAPI(title="OffGrid Core", version="5.0.0")

# Leer orígenes permitidos desde variable de entorno (mejor práctica en producción)
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# ─── HEALTH ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "online", "version": "5.0.0"}


# ─── MODELOS ────────────────────────────────────────────────────────────────
class ExtractionRequest(BaseModel):
    url: str
    format_type: Optional[str] = "mp4"  # "mp4" | "mp3"


# ─── HELPERS ────────────────────────────────────────────────────────────────
def get_shortcode(url: str) -> Optional[str]:
    try:
        if "/reel/" in url:
            return url.split("/reel/")[1].split("/")[0]
        if "/p/" in url:
            return url.split("/p/")[1].split("/")[0]
    except Exception:
        return None
    return None


def _resolve_cookie_path() -> Optional[str]:
    for path in ("/etc/secrets/cookies.txt", "cookies.txt"):
        if os.path.exists(path):
            print(f"   🍪 Cookies loaded from: {path}")
            return path
    print("   ⚠️  No cookies found. Anonymous mode (high block risk).")
    return None


# ─── MOTOR 1: YT-DLP ────────────────────────────────────────────────────────
def engine_ytdlp(request: ExtractionRequest) -> dict:
    print("   ↳ [1] yt-dlp...")
    cookie_path = _resolve_cookie_path()

    # Detectar si es un reel o un post normal
    is_reel = "/reel/" in request.url

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
        "socket_timeout": 15,
        "cookiefile": cookie_path,
        "extract_flat": False,
        "user_agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/17.0 Mobile/15E148 Safari/604.1"
        ),
    }

    # ✅ FIX: Para posts normales no aplicamos filtro de formato
    # para que yt-dlp traiga TODOS los assets (imágenes + vídeos)
    if is_reel and request.format_type == "mp3":
        ydl_opts["format"] = "bestaudio/best"
    elif is_reel:
        ydl_opts["format"] = "best"
    # Posts /p/ → sin 'format' key, yt-dlp extrae todo

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(request.url, download=False)
        if not info:
            raise ValueError("yt-dlp returned no info")

        entries = info.get("entries") or [info]
        results = []

        for entry in entries:
            if not entry:
                continue

            media_url = entry.get("url")
            ext = entry.get("ext", "")
            fmt = entry.get("format", "").lower()

            # Detectar tipo real del entry
            is_video = ext == "mp4" or "video" in fmt

            if is_reel and request.format_type == "mp3":
                item_type = "audio"
            elif is_video:
                item_type = "video"
            else:
                item_type = "image"

            # Fallback a thumbnail si no hay URL de media
            if not media_url:
                media_url = entry.get("thumbnail")

            if not media_url:
                continue

            results.append({
                "type": item_type,
                "url": media_url,
                "thumbnail": entry.get("thumbnail") or media_url,
                "description": (
                    entry.get("description") or entry.get("title") or ""
                ).split("\n")[0][:200],
            })

        if not results:
            raise ValueError("yt-dlp found no valid media entries")

        return {"success": True, "engine": "yt-dlp", "items": results}


# ─── MOTOR 2: INSTALOADER ───────────────────────────────────────────────────
def engine_instaloader(request: ExtractionRequest) -> dict:
    print("   ↳ [2] Instaloader...")
    shortcode = get_shortcode(request.url)
    if not shortcode:
        raise ValueError("Could not extract shortcode from URL")

    L = instaloader.Instaloader()
    post = instaloader.Post.from_shortcode(L.context, shortcode)

    return {
        "success": True,
        "engine": "instaloader",
        "items": [{
            "type": "video" if post.is_video else "image",
            "url": post.video_url if post.is_video else post.url,
            "thumbnail": post.url,
            "description": (post.caption or "").split("\n")[0][:200],
        }],
    }


# ─── ENDPOINT /extract ──────────────────────────────────────────────────────
@app.post("/extract")
async def extract_media(request: ExtractionRequest):
    # Validar que el input sea una URL de Instagram
    try:
        parsed = urlparse(request.url)
        if parsed.netloc.lower() not in ALLOWED_INPUT_DOMAINS:
            raise HTTPException(
                status_code=422,
                detail="Only Instagram URLs are supported.",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid URL format.")

    print(f"⚡ Processing: {request.url} | Format: {request.format_type}")

    # Motor 1
    try:
        return await asyncio.to_thread(engine_ytdlp, request)
    except Exception as e1:
        print(f"   ✗ yt-dlp failed: {e1}")

    # Motor 2 (fallback)
    try:
        return await asyncio.to_thread(engine_instaloader, request)
    except Exception as e2:
        print(f"   ✗ Instaloader failed: {e2}")

    return {"success": False, "error": "Target locked (Private) or Invalid Link."}


# ─── ENDPOINT /proxy ────────────────────────────────────────────────────────
@app.get("/proxy")
async def proxy_media(
    url: str = Query(..., description="CDN URL to stream"),
    download: bool = Query(False, description="Trigger browser download"),
    ext: str = Query("mp4", description="File extension hint"),
):
    # Anti-SSRF: solo CDNs de Instagram
    if not is_valid_cdn_url(url):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Target domain not in allowlist.",
        )

    # Sanitizar extensión (evitar path traversal en Content-Disposition)
    safe_ext = ext.strip().lstrip(".").lower()
    if safe_ext not in ("mp4", "mp3", "jpg", "jpeg", "png", "webp"):
        safe_ext = "mp4"

    req_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.instagram.com/",
    }

    # Verificar que el CDN responde ANTES de abrir el StreamingResponse
    # (así podemos lanzar HTTPException si falla)
    async with httpx.AsyncClient() as client:
        try:
            head = await client.head(url, headers=req_headers, timeout=10.0)
            head.raise_for_status()
            content_type = head.headers.get("content-type", "application/octet-stream")
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"CDN returned {e.response.status_code}",
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail="CDN unreachable")

    async def stream_generator():
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "GET", url, headers=req_headers, timeout=30.0
            ) as response:
                async for chunk in response.aiter_bytes(chunk_size=32 * 1024):
                    yield chunk

    response_headers = {}
    if download:
        filename = f"offgrid_media.{safe_ext}"
        response_headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    return StreamingResponse(
        stream_generator(),
        media_type=content_type,
        headers=response_headers,
    )


# ─── ENTRYPOINT ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
