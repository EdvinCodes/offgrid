import yt_dlp
import uvicorn
import requests
import instaloader
import os
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="OffGrid Core", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractionRequest(BaseModel):
    url: str

def get_shortcode(url: str):
    try:
        if "/reel/" in url: return url.split("/reel/")[1].split("/")[0]
        if "/p/" in url: return url.split("/p/")[1].split("/")[0]
    except: return None
    return None

# --- MOTOR 1: YT-DLP (Optimizado para Single File) ---
def engine_ytdlp(url: str):
    print("   ↳ [1] yt-dlp...")

    # Lógica inteligente de Cookies
    # 1. Producción (Render Secret File)
    cookie_path = "/etc/secrets/cookies.txt"
    # 2. Desarrollo (Local)
    if not os.path.exists(cookie_path):
        cookie_path = "cookies.txt"
    
    # Si no existe en ninguno, avisamos (pero intentamos sin cookies)
    if os.path.exists(cookie_path):
        print(f"   🍪 Cookies loaded from: {cookie_path}")
    else:
        print("   ⚠️ No cookies found. Running in anonymous mode (High Risk of Block).")
        cookie_path = None

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'best',
        'nocheckcertificate': True,
        'ignoreerrors': True,
        'socket_timeout': 15,
        'cookiefile': cookie_path, # <--- AQUÍ ESTÁ LA MAGIA
        'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info: raise ValueError("No info")
        
        if 'entries' in info:
            info = info['entries'][0]

        media_url = info.get('url')
        ext = info.get('ext')
        is_video = ext == 'mp4' or 'video' in info.get('format', '').lower()

        if not is_video and not media_url:
            media_url = info.get('thumbnail')

        return {
            "success": True,
            "engine": "yt-dlp",
            "type": "video" if is_video else "image",
            "url": media_url,
            "thumbnail": info.get('thumbnail') or media_url,
            "description": (info.get('description') or info.get('title') or "").split('\n')[0][:200]
        }

# --- MOTOR 2: INSTALOADER (Respaldo Imágenes/Posts) ---
def engine_instaloader(url: str):
    print("   ↳ [2] Instaloader...")
    L = instaloader.Instaloader()
    shortcode = get_shortcode(url)
    if not shortcode: raise ValueError("Bad Shortcode")

    post = instaloader.Post.from_shortcode(L.context, shortcode)
    
    return {
        "success": True,
        "engine": "instaloader",
        "type": "video" if post.is_video else "image",
        "url": post.video_url if post.is_video else post.url,
        "thumbnail": post.url,
        "description": (post.caption or "").split('\n')[0][:200]
    }

@app.post("/extract")
async def extract_media(request: ExtractionRequest):
    print(f"⚡ Processing: {request.url}")
    
    # Intento 1
    try:
        return engine_ytdlp(request.url)
    except Exception as e1:
        print(f"   x yt-dlp error: {e1}")
        # Intento 2
        try:
            return engine_instaloader(request.url)
        except Exception as e2:
            print(f"   x Instaloader error: {e2}")
            return {"success": False, "error": "Target locked (Private) or Invalid Link."}

@app.get("/proxy")
async def proxy_media(url: str = Query(..., description="Target URL")):
    # Headers rotados para evitar bloqueos
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/'
    }
    try:
        r = requests.get(url, headers=headers, stream=True, timeout=20)
        r.raise_for_status()
        return StreamingResponse(
            r.iter_content(chunk_size=32*1024), 
            media_type=r.headers.get("Content-Type", "application/octet-stream")
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Tunnel collapsed")

if __name__ == "__main__":
    # Obtenemos el puerto de la nube, o usamos 8000 si estamos en casa
    port = int(os.environ.get("PORT", 8000))
    # host="0.0.0.0" es OBLIGATORIO para que Render/Docker puedan ver tu app
    uvicorn.run(app, host="0.0.0.0", port=port)