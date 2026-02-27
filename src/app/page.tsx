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
  Music,
  Video,
  WifiOff,
  History,
  X,
  Image,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// ─── TIPOS ──────────────────────────────────────────────────────────────────
interface ExtractionItem {
  type: "video" | "image" | "audio";
  url: string;
  thumbnail: string;
  description?: string;
}

interface HistoryEntry {
  id: string;
  sourceUrl: string; // URL de Instagram original
  item: ExtractionItem;
  format: FormatType;
  timestamp: number;
}

type FormatType = "mp4" | "mp3";
type EngineStatus = "checking" | "online" | "offline";

const ENGINE_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const HISTORY_KEY = "offgrid_history";
const MAX_HISTORY = 8;

const LOADING_STEPS = [
  "Initializing handshake...",
  "Resolving host instructions...",
  "Bypassing CDN fingerprinting...",
  "Extracting raw stream...",
  "Finalizing payload...",
];

const INSTAGRAM_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+/;

// ─── HELPERS ────────────────────────────────────────────────────────────────
function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(entries.slice(0, MAX_HISTORY)),
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ─── COMPONENTE HISTORIAL ───────────────────────────────────────────────────
function HistoryPanel({
  entries,
  onSelect,
  onDelete,
  onClear,
}: {
  entries: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const typeIcon = (type: ExtractionItem["type"]) => {
    if (type === "video") return <Disc className="w-3 h-3 text-emerald-500" />;
    if (type === "audio") return <Music className="w-3 h-3 text-purple-400" />;
    return <Image className="w-3 h-3 text-blue-400" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="w-full rounded-lg border border-neutral-800 bg-[#0a0a0a] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2 text-[10px] text-neutral-400 uppercase tracking-widest">
          <History className="w-3 h-3" />
          <span>Extraction Log</span>
          <span className="bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded text-[9px]">
            {entries.length}/{MAX_HISTORY}
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-[9px] text-neutral-600 hover:text-red-400 uppercase tracking-widest transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Entries */}
      <ul className="divide-y divide-neutral-900">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-900/50 transition-colors"
          >
            {/* Thumbnail */}
            <button
              onClick={() => onSelect(entry)}
              className="shrink-0 w-10 h-10 rounded overflow-hidden border border-neutral-800 bg-black"
            >
              <img
                src={entry.item.thumbnail}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </button>

            {/* Info */}
            <button
              onClick={() => onSelect(entry)}
              className="flex-1 text-left min-w-0"
            >
              <p className="text-[11px] text-neutral-300 truncate font-mono">
                {entry.item.description || entry.sourceUrl}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {typeIcon(entry.item.type)}
                <span className="text-[9px] text-neutral-600 uppercase tracking-widest">
                  {entry.format} · {formatTimeAgo(entry.timestamp)}
                </span>
              </div>
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(entry.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ─── PÁGINA PRINCIPAL ───────────────────────────────────────────────────────
export default function HomePage() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<FormatType>("mp4");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState<ExtractionItem | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("checking");

  // ── Feature 3: Historial ─────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Cargar historial desde localStorage al montar
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // ── Health check ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${ENGINE_BASE}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        setEngineStatus(res.ok ? "online" : "offline");
      } catch {
        setEngineStatus("offline");
      }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Loading steps ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) return;
    let step = 0;
    const interval = setInterval(() => {
      setLoadingMsg(LOADING_STEPS[step % LOADING_STEPS.length]);
      step++;
    }, 600);
    return () => clearInterval(interval);
  }, [loading]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (!INSTAGRAM_REGEX.test(url.trim())) {
      toast.error("Only Instagram post, reel or TV links are supported.");
      return;
    }

    if (engineStatus === "offline") {
      toast.error("Engine offline. Start the backend first.");
      return;
    }

    setLoading(true);
    setResult(null);
    setShowHistory(false);

    const data = await extractMedia(url.trim(), format);

    if (data.success && data.items && data.items.length > 0) {
      const newItem = data.items[0] as ExtractionItem;
      setResult(newItem);
      toast.success("Target acquired.");

      // ── Guardar en historial ────────────────────────────────────────────
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        sourceUrl: url.trim(),
        item: newItem,
        format,
        timestamp: Date.now(),
      };
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
    } else {
      toast.error(data.error || "Connection refused by host.");
    }

    setLoading(false);
  };

  // Restaurar resultado desde historial sin re-extraer
  const handleSelectHistory = (entry: HistoryEntry) => {
    setResult(entry.item);
    setUrl(entry.sourceUrl);
    setFormat(entry.format);
    setShowHistory(false);
    toast.info("Log entry restored.");
  };

  const handleDeleteHistory = (id: string) => {
    const updated = history.filter((e) => e.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    setShowHistory(false);
    toast.success("Log cleared.");
  };

  const copyToClipboard = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Stream URL copied to clipboard");
    } catch {
      toast.error("Clipboard access denied.");
    }
  };

  const handleDownload = () => {
    if (!result || downloading) return;
    setDownloading(true);

    const ext =
      result.type === "video" ? "mp4" : result.type === "audio" ? "mp3" : "jpg";
    const tunnelUrl = `${ENGINE_BASE}/proxy?url=${encodeURIComponent(result.url)}&download=true&ext=${ext}`;

    const a = document.createElement("a");
    a.href = tunnelUrl;
    a.download = `offgrid_media_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success("Download initiated.");
    setDownloading(false);
  };

  const getTypeIcon = () => {
    if (result?.type === "video") return <Disc className="w-3 h-3" />;
    if (result?.type === "audio") return <Music className="w-3 h-3" />;
    return <FileJson className="w-3 h-3" />;
  };

  const previewUrl = result
    ? `${ENGINE_BASE}/proxy?url=${encodeURIComponent(result.url)}`
    : "";

  const statusConfig = {
    checking: { color: "bg-yellow-500", label: "Checking Engine..." },
    online: { color: "bg-emerald-500", label: "System Online" },
    offline: { color: "bg-red-500", label: "Engine Offline" },
  } as const;
  const { color: dotColor, label: statusLabel } = statusConfig[engineStatus];

  return (
    <main className="min-h-screen w-full relative flex flex-col items-center justify-center p-6 bg-dot-pattern overflow-hidden font-mono">
      <div className="scanline" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50 text-[10px] uppercase tracking-widest text-neutral-500">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`} />
          <span
            className={
              engineStatus === "offline" ? "text-red-500" : "text-neutral-500"
            }
          >
            {statusLabel}
          </span>
          {engineStatus === "offline" && (
            <WifiOff className="w-3 h-3 text-red-500" />
          )}
        </div>

        {/* ── Botón historial en el header ── */}
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`flex items-center gap-1.5 transition-colors ${
              showHistory
                ? "text-emerald-400"
                : "text-neutral-600 hover:text-neutral-300"
            }`}
          >
            <History className="w-3 h-3" />
            <span>Log ({history.length})</span>
          </button>
        )}
      </header>

      <div className="z-10 w-full max-w-2xl flex flex-col gap-8">
        {/* Branding */}
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-white">
            OFF<span className="text-neutral-600">GRID</span>
          </h1>
          <p className="text-neutral-500 text-xs md:text-sm tracking-wide">
            {"// BYPASS ALGORITHMS. EXTRACT RAW DATA. NO LOGS."}
          </p>
        </div>

        {/* Format Toggle */}
        <div className="flex items-center gap-1 bg-[#0a0a0a] border border-neutral-800 rounded-md p-1 w-fit">
          <button
            type="button"
            onClick={() => setFormat("mp4")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-all ${
              format === "mp4"
                ? "bg-white text-black"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Video className="w-3 h-3" />
            MP4
          </button>
          <button
            type="button"
            onClick={() => setFormat("mp3")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-all ${
              format === "mp3"
                ? "bg-emerald-500 text-black"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Music className="w-3 h-3" />
            MP3
          </button>
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
              placeholder="Paste Instagram link..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 border-none bg-transparent shadow-none focus-visible:ring-0 text-base font-mono text-neutral-200 placeholder:text-neutral-700"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={loading || !url.trim() || engineStatus === "offline"}
              className="h-10 px-6 mr-1 bg-neutral-100 hover:bg-white text-black font-bold text-xs uppercase tracking-wider rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "EXECUTE"
              )}
            </button>
          </div>

          <div className="h-6 mt-2 text-[10px] text-emerald-500/80 font-mono pl-4 flex items-center gap-2">
            {loading && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{loadingMsg}</span>
              </>
            )}
            {!loading && engineStatus === "offline" && (
              <span className="text-red-500/80">
                ENGINE_OFFLINE — Run python backend/server.py
              </span>
            )}
          </div>
        </motion.form>

        {/* ── Feature 3: Panel historial ── */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <HistoryPanel
              entries={history}
              onSelect={handleSelectHistory}
              onDelete={handleDeleteHistory}
              onClear={handleClearHistory}
            />
          )}
        </AnimatePresence>

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
                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-neutral-800 to-neutral-900" />

                <div className="flex flex-col md:flex-row">
                  {/* Media Preview */}
                  <div className="w-full md:w-1/2 bg-black border-b md:border-b-0 md:border-r border-neutral-800 relative min-h-[300px] flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-10 pointer-events-none" />

                    {result.type === "video" ? (
                      <video
                        src={previewUrl}
                        poster={result.thumbnail}
                        className="w-full h-full max-h-[400px] object-contain relative z-0"
                        controls
                        autoPlay
                        muted
                        loop
                      />
                    ) : result.type === "audio" ? (
                      <div className="flex flex-col items-center gap-4 p-8 z-0">
                        {result.thumbnail && (
                          <img
                            src={result.thumbnail}
                            className="w-32 h-32 rounded-full object-cover border border-neutral-800"
                            alt="Audio thumbnail"
                          />
                        )}
                        <audio src={previewUrl} controls className="w-full" />
                      </div>
                    ) : (
                      <img
                        src={previewUrl}
                        className="w-full h-full object-contain relative z-0"
                        alt="Extracted media"
                      />
                    )}

                    <div className="absolute top-3 left-3 z-20 bg-black/50 backdrop-blur border border-white/10 px-2 py-1 rounded text-[10px] text-white uppercase tracking-widest flex items-center gap-2">
                      {getTypeIcon()}
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
                        className="w-full h-12 bg-white hover:bg-neutral-200 text-black font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
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

                    <div className="pt-4 border-t border-neutral-900 flex justify-between text-[9px] text-neutral-600 font-mono uppercase">
                      <span>Proxy: Active</span>
                      <span>
                        Format:{" "}
                        <span
                          className={
                            format === "mp3" ? "text-emerald-500" : "text-white"
                          }
                        >
                          {format.toUpperCase()}
                        </span>
                      </span>
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
