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
ALLOWED_CDN_DOMAINS = [
    ".cdninstagram.com", ".instagram.com", ".fbcdn.net",
]


def is_valid_cdn_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        return parsed.scheme in ("http", "https") and any(
            netloc.endswith(d) for d in ALLOWED_CDN_DOMAINS
        )
    except Exception:
        return False


# ─── APP ────────────────────────────────────────────────────────────────────
app = FastAPI(title="OffGrid Core", version="5.1.0")

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
    return {"status": "online", "version": "5.1.0"}


# ─── MODELOS ────────────────────────────────────────────────────────────────
class ExtractionRequest(BaseModel):
    url: str
    format_type: Optional[str] = "mp4"  # "mp4" | "mp3"


# ─── HELPERS ────────────────────────────────────────────────────────────────
def get_shortcode(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url.split("?")[0].rstrip("/"))
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("p", "reel", "tv"):
            return parts[1]
    except Exception as e:
        print(f"   ⚠️ Error parsing shortcode: {e}")
    return None

def _resolve_cookie_path() -> Optional[str]:
    for path in ("/etc/secrets/cookies.txt", "cookies.txt"):
        if os.path.exists(path):
            print(f"   🍪 Cookies loaded from: {path}")
            return path
    print("   ⚠️  No cookies found. Anonymous mode (high block risk).")
    return None


# ─── MOTOR 1: INSTALOADER (posts /p/ con carrusel mixto) ────────────────────
def engine_instaloader_carousel(request: ExtractionRequest) -> dict:
    print("   ↳ [Instaloader] Extracting post...")
    shortcode = get_shortcode(request.url)
    if not shortcode:
        raise ValueError("Could not extract shortcode from URL")

    L = instaloader.Instaloader()
    post = instaloader.Post.from_shortcode(L.context, shortcode)

    print(f"   ↳ typename: {post.typename} | mediacount: {post.mediacount}")

    results = []

    # Intentar siempre como carrusel primero
    # (Instagram cambia el typename: GraphSidecar, XDTGraphSidecar, etc.)
    try:
        nodes = list(post.get_sidecar_nodes())
        if nodes:
            print(f"   ↳ Sidecar nodes found: {len(nodes)}")
            for node in nodes:
                if node.is_video:
                    results.append({
                        "type": "video",
                        "url": node.video_url,
                        "thumbnail": node.display_url,
                        "description": (post.caption or "").split("\n")[0][:200],
                    })
                else:
                    results.append({
                        "type": "image",
                        "url": node.display_url,
                        "thumbnail": node.display_url,
                        "description": (post.caption or "").split("\n")[0][:200],
                    })
    except Exception as sidecar_err:
        print(f"   ↳ get_sidecar_nodes failed: {sidecar_err}")

    # Si no hay nodos (post simple o fallo del sidecar), usar el post directamente
    if not results:
        print("   ↳ Falling back to single post extraction")
        results.append({
            "type": "video" if post.is_video else "image",
            "url": post.video_url if post.is_video else post.url,
            "thumbnail": post.url,
            "description": (post.caption or "").split("\n")[0][:200],
        })

    print(f"   ✓ Total items extracted: {len(results)}")
    return {"success": True, "engine": "instaloader", "items": results}


# ─── MOTOR 2: YT-DLP (reels y tv — audio/vídeo) ─────────────────────────────
def engine_ytdlp_reel(request: ExtractionRequest) -> dict:
    """
    yt-dlp es ideal para Reels porque permite elegir formato
    (mp4 o mp3) y extrae el stream de alta calidad.
    """
    print("   ↳ [yt-dlp] Extracting reel...")
    cookie_path = _resolve_cookie_path()

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
        "socket_timeout": 15,
        "extract_flat": False,
        "format": "bestaudio/best" if request.format_type == "mp3" else "best",
        "user_agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/17.0 Mobile/15E148 Safari/604.1"
        ),
    }
    if cookie_path:
        ydl_opts["cookiefile"] = cookie_path

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
            is_video = ext == "mp4" or "video" in fmt

            if request.format_type == "mp3":
                item_type = "audio"
            elif is_video:
                item_type = "video"
            else:
                item_type = "image"

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


def is_instagram_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.netloc.lower().removeprefix("www.")
        if host not in ("instagram.com", "m.instagram.com"):
            return False
        parts = [p for p in parsed.path.split("/") if p]
        return len(parts) >= 2 and parts[0] in ("p", "reel", "tv")
    except Exception:
        return False


# ─── ENDPOINT /extract ──────────────────────────────────────────────────────
@app.post("/extract")
async def extract_media(request: ExtractionRequest):
    if not is_instagram_url(request.url):
        raise HTTPException(
            status_code=422,
            detail="Only Instagram post, reel or TV links are supported.",
        )

    is_post = "/p/" in request.url
    is_reel = "/reel/" in request.url or "/tv/" in request.url

    print(f"⚡ Processing: {request.url} | Format: {request.format_type} | Type: {'post' if is_post else 'reel'}")

    # ── Estrategia por tipo de URL ──────────────────────────────────────────
    if is_post:
        # Posts: Instaloader primero (soporta carruseles mixtos)
        # yt-dlp como fallback
        try:
            return await asyncio.to_thread(engine_instaloader_carousel, request)
        except Exception as e1:
            print(f"   ✗ Instaloader failed: {e1}")
        try:
            return await asyncio.to_thread(engine_ytdlp_reel, request)
        except Exception as e2:
            print(f"   ✗ yt-dlp fallback failed: {e2}")

    elif is_reel:
        # Reels/TV: yt-dlp primero (mejor calidad y soporte mp3)
        # Instaloader como fallback
        try:
            return await asyncio.to_thread(engine_ytdlp_reel, request)
        except Exception as e1:
            print(f"   ✗ yt-dlp failed: {e1}")
        try:
            return await asyncio.to_thread(engine_instaloader_carousel, request)
        except Exception as e2:
            print(f"   ✗ Instaloader fallback failed: {e2}")

    else:
        # URL desconocida: intentar ambos
        try:
            return await asyncio.to_thread(engine_ytdlp_reel, request)
        except Exception as e1:
            print(f"   ✗ yt-dlp failed: {e1}")
        try:
            return await asyncio.to_thread(engine_instaloader_carousel, request)
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
    if not is_valid_cdn_url(url):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Target domain not in allowlist.",
        )

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

    # Some CDNs reject HEAD requests — probe with a streaming GET instead.
    client = httpx.AsyncClient(follow_redirects=True, timeout=30.0)
    try:
        req = client.build_request("GET", url, headers=req_headers)
        upstream = await client.send(req, stream=True)

        if upstream.status_code >= 400:
            await upstream.aclose()
            raise HTTPException(
                status_code=502,
                detail=f"CDN returned {upstream.status_code}",
            )

        content_type = upstream.headers.get(
            "content-type", "application/octet-stream"
        )

        async def stream_generator():
            try:
                async for chunk in upstream.aiter_bytes(chunk_size=32 * 1024):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

    except HTTPException:
        await client.aclose()
        raise
    except Exception:
        await client.aclose()
        raise HTTPException(status_code=502, detail="CDN unreachable")

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
