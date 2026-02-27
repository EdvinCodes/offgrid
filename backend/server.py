import yt_dlp
import uvicorn
import requests
import instaloader
import os
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from urllib.parse import urlparse
import httpx
from typing import Optional, List

# Lista de dominios permitidos por donde Instagram y Facebook sirven contenido
ALLOWED_DOMAINS = [".cdninstagram.com", ".instagram.com", ".fbcdn.net"]

def is_valid_instagram_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        return any(netloc.endswith(domain) for domain in ALLOWED_DOMAINS)
    except Exception:
        return False

app = FastAPI(title="OffGrid Core", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://tu-dominio-offgrid.com"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "online", "version": "5.0.0"}
class ExtractionRequest(BaseModel):
    url: str
    format_type: Optional[str] = "mp4" # Puede ser "mp4" o "mp3"

def get_shortcode(url: str):
    try:
        if "/reel/" in url: return url.split("/reel/")[1].split("/")[0]
        if "/p/" in url: return url.split("/p/")[1].split("/")[0]
    except: return None
    return None

# --- MOTOR 1: YT-DLP (Optimizado para Playlists y MP3/MP4) ---
def engine_ytdlp(request: ExtractionRequest):
    print("   ↳ [1] yt-dlp...")

    cookie_path = "/etc/secrets/cookies.txt"
    if not os.path.exists(cookie_path):
        cookie_path = "cookies.txt"
    
    if os.path.exists(cookie_path):
        print(f"   🍪 Cookies loaded from: {cookie_path}")
    else:
        print("   ⚠️ No cookies found. Running in anonymous mode (High Risk of Block).")
        cookie_path = None

    # Configuramos yt-dlp dinámicamente según el formato solicitado
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'ignoreerrors': True,
        'socket_timeout': 15,
        'cookiefile': cookie_path,
        'extract_flat': False, # Para resolver playlists reales
        'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }

    # Si el usuario quiere MP3, forzamos la extracción de audio
    if request.format_type == "mp3":
        ydl_opts['format'] = 'bestaudio/best'
    else:
        ydl_opts['format'] = 'best'
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(request.url, download=False)
        if not info: raise ValueError("No info")
        
        results = []
        
        entries = info.get('entries', [info]) if 'entries' in info else [info]
        
        for entry in entries:
            if not entry: continue
            media_url = entry.get('url')
            ext = entry.get('ext')
            is_video = ext == 'mp4' or 'video' in entry.get('format', '').lower()
            
            # Si pedimos mp3, tratamos el tipo como audio
            item_type = "audio" if request.format_type == "mp3" else ("video" if is_video else "image")

            if not is_video and not media_url:
                media_url = entry.get('thumbnail')

            results.append({
                "type": item_type,
                "url": media_url,
                "thumbnail": entry.get('thumbnail') or media_url,
                "description": (entry.get('description') or entry.get('title') or "").split('\n')[0][:200]
            })

        return {
            "success": True,
            "engine": "yt-dlp",
            "items": results # Devolvemos un array con todos los medios
        }

# --- MOTOR 2: INSTALOADER (Respaldo Imágenes/Posts) ---
def engine_instaloader(request: ExtractionRequest):
    print("   ↳ [2] Instaloader...")
    L = instaloader.Instaloader()
    shortcode = get_shortcode(request.url)
    if not shortcode: raise ValueError("Bad Shortcode")

    post = instaloader.Post.from_shortcode(L.context, shortcode)
    
    # Envolvemos el resultado en un array "items" para que coincida con la nueva estructura de yt-dlp
    item = {
        "type": "video" if post.is_video else "image",
        "url": post.video_url if post.is_video else post.url,
        "thumbnail": post.url,
        "description": (post.caption or "").split('\n')[0][:200]
    }
    
    return {
        "success": True,
        "engine": "instaloader",
        "items": [item]
    }

@app.post("/extract")
def extract_media(request: ExtractionRequest): 
    # Ahora pasamos el objeto 'request' completo a los motores
    print(f"⚡ Processing: {request.url} | Format: {request.format_type}")
    
    try:
        return engine_ytdlp(request)
    except Exception as e1:
        print(f"   x yt-dlp error: {e1}")
        try:
            return engine_instaloader(request)
        except Exception as e2:
            print(f"   x Instaloader error: {e2}")
            return {"success": False, "error": "Target locked (Private) or Invalid Link."}

# 2. FIX DE SSRF + STREAMING ASÍNCRONO
@app.get("/proxy")
async def proxy_media(url: str = Query(..., description="Target URL")):
    # Validamos que la URL sea legítima de Instagram
    if not is_valid_instagram_url(url):
        raise HTTPException(status_code=403, detail="Forbidden: Target domain not allowed.")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/'
    }
    
    # Creamos un generador asíncrono usando httpx
    async def stream_generator():
        async with httpx.AsyncClient() as client:
            try:
                # El timeout es importante para no dejar conexiones colgadas
                async with client.stream("GET", url, headers=headers, timeout=20.0) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=32*1024):
                        yield chunk
            except Exception:
                # Si se cae el túnel, cortamos el stream limpiamente
                pass 

    return StreamingResponse(
        stream_generator(), 
        media_type="application/octet-stream"
    )

if __name__ == "__main__":
    # Obtenemos el puerto de la nube, o usamos 8000 si estamos en casa
    port = int(os.environ.get("PORT", 8000))
    # host="0.0.0.0" es OBLIGATORIO para que Render/Docker puedan ver tu app
    uvicorn.run(app, host="0.0.0.0", port=port)