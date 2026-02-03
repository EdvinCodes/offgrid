"use client";

import { useState } from "react";
import { extractMedia } from "@/actions/extract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Disc,
  FileJson,
  Download,
  Copy,
  Check,
  ScanLine,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface ExtractionResult {
  type: "video" | "image";
  url: string;
  thumbnail: string;
  description?: string;
}

const ENGINE_BASE = "http://127.0.0.1:8000";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setResult(null);

    const data = await extractMedia(url);
    if (data.success) {
      setResult(data);
      toast.success("Media extracted successfully.");
    } else {
      toast.error(data.error || "Invalid media or unsupported link.");
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    toast.info("Source URL copied.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const tunnelUrl = `${ENGINE_BASE}/proxy?url=${encodeURIComponent(
        result.url,
      )}`;
      const response = await fetch(tunnelUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `offgrid_${Date.now()}.${
        result.type === "video" ? "mp4" : "jpg"
      }`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download finalized.");
    } catch {
      window.open(result.url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-[#020617] via-[#020617] to-[#020617] text-slate-50 relative overflow-hidden">
      {/* Glow background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-40 left-10 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
            <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
          </span>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              OffGrid
            </p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Media extractor
            </p>
          </div>
        </div>
      </header>

      {/* Hero + console */}
      <section className="relative z-20 mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-24 pt-16 md:flex-row md:items-start md:justify-between md:px-10 md:pt-20">
        {/* Left: Hero copy */}
        <div className="max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-300 backdrop-blur">
            Smart media decode
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-black uppercase leading-tight tracking-tight text-slate-50 md:text-4xl">
              Extract clean media
              <br />
              from your links
            </h1>
            <p className="max-w-md text-sm text-slate-400 md:text-[15px]">
              Paste any supported Instagram reel or photo URL and get a direct
              source link ready to download or reuse.
            </p>
          </div>

          <p className="text-[11px] text-slate-500">
            Works best with public posts and reels. Private or expired links may
            fail to resolve.
          </p>
        </div>

        {/* Right: Console + result */}
        <div className="w-full max-w-md space-y-5">
          {/* Console Input */}
          <motion.form
            onSubmit={handleExtract}
            className="space-y-4 rounded-2xl border border-white/10 bg-[#020617]/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.6)] backdrop-blur-xl md:p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="uppercase tracking-[0.2em]">
                Extraction console
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Ready
              </span>
            </div>

            <div className="relative mt-2 flex items-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center pl-4 text-slate-500">
                <ScanLine className="h-4 w-4" />
              </div>
              <Input
                placeholder="Paste Instagram reel or photo link…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-11 border-none bg-transparent text-sm font-medium text-slate-100 placeholder:text-slate-500 focus-visible:ring-0"
              />
              <Button
                type="submit"
                disabled={loading || !url}
                className="h-11 rounded-none rounded-l-xl bg-slate-50 px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-900 hover:bg-slate-200 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Extract"
                )}
              </Button>
            </div>
          </motion.form>

          {/* Data Output */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.url}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="w-full"
              >
                <Card className="overflow-hidden rounded-2xl border border-white/10 bg-[#020617]/80 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
                  {/* Player más pequeño: aspect-[4/5] y max-w-md centrado */}
                  <div className="flex justify-center border-b border-white/10 bg-slate-900/80">
                    <div className="relative w-full max-w-sm aspect-[4/5]">
                      {result.thumbnail && (
                        <img
                          src={`${ENGINE_BASE}/proxy?url=${encodeURIComponent(
                            result.thumbnail,
                          )}`}
                          alt="Source Preview"
                          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-40"
                        />
                      )}

                      {result.type === "video" ? (
                        <video
                          src={result.url}
                          className="relative z-10 h-full w-full object-contain"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={`${ENGINE_BASE}/proxy?url=${encodeURIComponent(
                            result.url,
                          )}`}
                          className="relative z-10 h-full w-full object-contain"
                          alt="Extracted media"
                        />
                      )}

                      <div className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-100 backdrop-blur">
                        {result.type === "video" ? (
                          <Disc className="h-3 w-3 animate-spin text-emerald-300" />
                        ) : (
                          <FileJson className="h-3 w-3 text-sky-300" />
                        )}
                        {result.type}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 p-5 md:p-6">
                    <div className="space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        Meta
                      </span>
                      <p className="text-sm font-medium text-slate-100">
                        {result.description || "No metadata provided."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        onClick={copyToClipboard}
                        className="h-10 rounded-xl border-white/20 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10"
                      >
                        {copied ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        Copy URL
                      </Button>

                      <Button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="h-10 rounded-xl bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900 hover:bg-slate-200 disabled:opacity-60"
                      >
                        {downloading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Download
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Footer mínimo */}
      <footer className="pointer-events-none fixed bottom-6 left-0 right-0 z-10 flex justify-center">
        <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400 backdrop-blur">
          <span>OffGrid</span>
          <span>Media Tools</span>
        </div>
      </footer>
    </main>
  );
}
