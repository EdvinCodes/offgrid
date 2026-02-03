"use client";

import { useState } from "react";
import { extractMedia } from "@/actions/extract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Disc,
  FileJson,
  Download,
  Copy,
  Check,
  ScanLine,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface ExtractionResult {
  type: "video" | "image";
  url: string;
  thumbnail: string;
  description?: string;
}

export default function Home() {
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
      setResult(data as ExtractionResult);
      toast.success("Media object located.");
    } else {
      toast.error(data.error || "Extraction failed.");
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    toast.info("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);

    try {
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("Network response was not ok");

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `offgrid_${Date.now()}.${result.type === "video" ? "mp4" : "jpg"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download started");
    } catch (error) {
      console.error("Auto-download failed (CORS), opening in new tab:", error);
      window.open(result.url, "_blank");
      toast.info("Opening in new tab (Right click to save)");
    }
    setDownloading(false);
  };

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F4F4F5] text-black font-mono selection:bg-black selection:text-white relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      ></div>

      <div className="z-10 w-full max-w-xl px-6 space-y-8">
        <div className="flex flex-col items-start space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-black animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase opacity-50">
              System Ready
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase leading-[0.85]">
            Off
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-neutral-500 to-neutral-800">
              Grid
            </span>
          </h1>
          <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
            Extract high-fidelity media from Instagram’s CDN. <br />
            Bypass the algorithm. Keep the file.
          </p>
        </div>

        <form onSubmit={handleExtract} className="relative group w-full">
          <div className="relative flex items-center bg-white border border-neutral-200 shadow-sm transition-all duration-300 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent">
            <div className="pl-4 text-neutral-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <Input
              placeholder="Paste secure link..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-14 border-none shadow-none focus-visible:ring-0 text-base bg-transparent placeholder:text-neutral-300 font-medium"
            />
            <Button
              type="submit"
              disabled={loading || !url}
              className="h-10 mr-2 px-6 bg-black hover:bg-neutral-800 text-white rounded-none font-bold uppercase tracking-wider transition-all"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>DECRYPTING...</span>
                </div>
              ) : (
                "EXTRACT"
              )}
            </Button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full"
            >
              <div className="bg-white border border-neutral-200 shadow-xl overflow-hidden group">
                <div className="relative aspect-video bg-neutral-100 border-b border-neutral-200 flex items-center justify-center overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-20 blur-xl scale-110"
                    style={{ backgroundImage: `url(${result.thumbnail})` }}
                  />
                  <img
                    src={result.thumbnail}
                    alt="Media Preview"
                    referrerPolicy="no-referrer"
                    className="relative h-full w-full object-contain z-10"
                  />
                  <div className="absolute top-3 left-3 z-20 bg-black/90 backdrop-blur text-white text-[10px] px-2 py-1 uppercase font-bold tracking-widest flex items-center gap-1.5 shadow-lg">
                    {result.type === "video" ? (
                      <Disc className="w-3 h-3 animate-spin-slow" />
                    ) : (
                      <FileJson className="w-3 h-3" />
                    )}
                    {result.type.toUpperCase()}_OBJ
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                      Description Payload
                    </h3>
                    <p className="text-sm font-medium text-neutral-800 line-clamp-2 leading-relaxed">
                      {result.description ||
                        "No metadata available for this object."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={copyToClipboard}
                      className="h-12 border-neutral-200 hover:bg-neutral-50 hover:border-black transition-colors rounded-none uppercase text-xs font-bold tracking-wider"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 mr-2" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      Copy Link
                    </Button>

                    <Button
                      onClick={handleDownload}
                      disabled={downloading}
                      className="w-full h-12 bg-black hover:bg-neutral-800 text-white rounded-none uppercase text-xs font-bold tracking-wider gap-2 group-hover:shadow-lg transition-all"
                    >
                      {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                          Download File
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 flex justify-between items-center text-[10px] text-neutral-400 uppercase tracking-widest">
                    <span>Secured Connection</span>
                    <span className="flex items-center gap-1">
                      API Status: Live{" "}
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
