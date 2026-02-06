"use client";

import { useState, useEffect } from "react";
import { extractMedia } from "@/actions/extract";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Disc,
  FileJson,
  Download,
  Copy,
  ShieldCheck,
  ChevronRight,
  Heart,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface ExtractionResult {
  type: "video" | "image";
  url: string;
  thumbnail: string;
  description?: string;
}

const ENGINE_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const LOADING_STEPS = [
  "Initializing handshake...",
  "Resolving host instructions...",
  "Bypassing CDN fingerprinting...",
  "Extracting raw stream...",
  "Finalizing payload...",
];

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!loading) return;
    let step = 0;
    const interval = setInterval(() => {
      setLoadingMsg(LOADING_STEPS[step % LOADING_STEPS.length]);
      step++;
    }, 600);
    return () => clearInterval(interval);
  }, [loading]);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setResult(null);

    const data = await extractMedia(url);
    if (data.success) {
      setResult(data as ExtractionResult);
      toast.success("Target acquired.");
    } else {
      toast.error(data.error || "Connection refused by host.");
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.url);
    toast.success("Stream URL copied to clipboard");
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const tunnelUrl = `${ENGINE_BASE}/proxy?url=${encodeURIComponent(result.url)}`;
      const response = await fetch(tunnelUrl);
      if (!response.ok) throw new Error("Proxy tunnel collapsed");

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `offgrid_dump_${Date.now()}.${result.type === "video" ? "mp4" : "jpg"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Asset secured locally.");
    } catch {
      window.open(result.url, "_blank");
      toast.warning("Direct stream opened (Fallback mode).");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="min-h-screen w-full relative flex flex-col items-center justify-center p-6 bg-dot-pattern overflow-hidden font-mono">
      {/* Scanline Effect */}
      <div className="scanline" />

      {/* Header Status Bar */}
      <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50 text-[10px] uppercase tracking-widest text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span>System Online</span>
        </div>
      </header>

      <div className="z-10 w-full max-w-2xl flex flex-col gap-10">
        {/* Branding */}
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-white">
            OFF<span className="text-neutral-600">GRID</span>
          </h1>
          <p className="text-neutral-500 text-xs md:text-sm tracking-wide">
            {"// BYPASS ALGORITHMS. EXTRACT RAW DATA. NO LOGS."}
          </p>
        </div>

        {/* Input Console */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleExtract}
          className="relative group"
        >
          <div className="absolute -inset-0.5 bg-neutral-800 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-500" />
          <div className="relative flex items-center bg-[#0a0a0a] border border-neutral-800 rounded-lg p-1">
            <div className="pl-3 pr-2 text-emerald-500 font-bold">
              <ChevronRight className="w-5 h-5" />
            </div>
            <Input
              placeholder="Paste encrypted link..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 border-none bg-transparent shadow-none focus-visible:ring-0 text-base font-mono text-neutral-200 placeholder:text-neutral-700"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="h-10 px-6 mr-1 bg-neutral-100 hover:bg-white text-black font-bold text-xs uppercase tracking-wider rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "EXECUTE"
              )}
            </button>
          </div>

          {/* Status logs */}
          <div className="h-6 mt-2 text-[10px] text-emerald-500/80 font-mono pl-4 flex items-center gap-2">
            {loading && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{loadingMsg}</span>
              </>
            )}
          </div>
        </motion.form>

        {/* Result Interface */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: "circOut" }}
              className="w-full"
            >
              <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] overflow-hidden shadow-2xl relative">
                {/* Top decoration */}
                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-neutral-800 to-neutral-900" />

                <div className="flex flex-col md:flex-row">
                  {/* Media Preview Area */}
                  <div className="w-full md:w-1/2 bg-black border-b md:border-b-0 md:border-r border-neutral-800 relative min-h-[300px] flex items-center justify-center group overflow-hidden">
                    {/* Grid Overlay on Image */}
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-10 pointer-events-none" />

                    {/* Media Render */}
                    {result.type === "video" ? (
                      <video
                        src={`${ENGINE_BASE}/proxy?url=${encodeURIComponent(result.url)}`}
                        className="w-full h-full max-h-[400px] object-contain relative z-0"
                        controls
                        autoPlay
                        muted
                        loop
                      />
                    ) : (
                      <img
                        src={`${ENGINE_BASE}/proxy?url=${encodeURIComponent(result.url)}`}
                        className="w-full h-full object-contain relative z-0"
                        alt="Target"
                      />
                    )}

                    {/* Type Tag */}
                    <div className="absolute top-3 left-3 z-20 bg-black/50 backdrop-blur border border-white/10 px-2 py-1 rounded text-[10px] text-white uppercase tracking-widest flex items-center gap-2">
                      {result.type === "video" ? (
                        <Disc className="w-3 h-3 animate-spin-slow" />
                      ) : (
                        <FileJson className="w-3 h-3" />
                      )}
                      {result.type.toUpperCase()}_OBJ
                    </div>
                  </div>

                  {/* Metadata & Controls */}
                  <div className="w-full md:w-1/2 p-6 flex flex-col justify-between gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-widest">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Secure Connection</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-widest">
                          Payload Data
                        </span>
                        <p className="text-xs text-neutral-300 leading-relaxed font-mono line-clamp-4 border-l-2 border-neutral-800 pl-3">
                          {result.description || "NO_METADATA_FOUND"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={copyToClipboard}
                        className="w-full h-10 border border-neutral-700 hover:border-white hover:text-white text-neutral-400 text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                      >
                        <Copy className="w-3 h-3" /> Copy Source Link
                      </button>

                      <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="w-full h-12 bg-white hover:bg-neutral-200 text-black font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                      >
                        {downloading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                            <span>Pull to Local Drive</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Footer Stats */}
                    <div className="pt-4 border-t border-neutral-900 flex justify-between text-[9px] text-neutral-600 font-mono uppercase">
                      <span>Latency: 24ms</span>
                      <span>Proxy: Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="fixed bottom-6 z-50 flex items-center gap-2 text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
        <span>Hecho por</span>
        <Heart className="h-3 w-3 text-red-500 fill-red-500/10 animate-pulse" />
        <a
          href="https://github.com/EdvinCodes"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors border-b border-transparent hover:border-emerald-500"
        >
          Edvin
        </a>
      </footer>
    </main>
  );
}
