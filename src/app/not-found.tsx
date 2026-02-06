"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MoveLeft, Terminal } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  // NOTA SENIOR: Hemos eliminado useState y useEffect.
  // Usamos 'suppressHydrationWarning' directamente en el HTML.
  // Es más performante y limpia el código.

  return (
    <main className="min-h-screen w-full relative flex flex-col items-center justify-center p-6 bg-[#050505] text-neutral-200 font-mono overflow-hidden selection:bg-red-900 selection:text-white">
      {/* 1. Background Effects */}
      <div
        className="absolute inset-0 z-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Scanline Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]"
        style={{ backgroundSize: "100% 2px, 3px 100%" }}
      />

      <div className="z-10 w-full max-w-lg flex flex-col items-center text-center gap-8">
        {/* Error Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full animate-pulse" />
          <div className="relative bg-black/50 border border-red-900/50 p-4 rounded-full backdrop-blur-sm">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </motion.div>

        {/* Glitch Typography */}
        <div className="space-y-2">
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-8xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-800"
          >
            404
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-2 text-red-500 text-xs font-bold uppercase tracking-[0.3em]"
          >
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
            Signal_Lost
          </motion.div>
        </div>

        {/* Technical Description */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 border-l-2 border-neutral-800 pl-4 text-left max-w-sm mx-auto"
        >
          <p className="text-sm text-neutral-400 leading-relaxed">
            The vector you are trying to access does not exist in this
            dimension. The link might be corrupted or the node has been
            terminated.
          </p>
          <div className="text-[10px] text-neutral-600 font-mono">
            ERR_CODE: PROTOCOL_MISSING
            <br />
            {/* TRUCO SENIOR: suppressHydrationWarning permite que el servidor y el cliente difieran en el timestamp sin lanzar error */}
            <span suppressHydrationWarning>
              TIMESTAMP: {new Date().toISOString()}
            </span>
          </div>
        </motion.div>

        {/* Action */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Link href="/">
            <Button className="h-12 px-8 bg-white hover:bg-neutral-200 text-black font-mono font-bold uppercase tracking-widest rounded-none border border-transparent hover:border-emerald-500 transition-all group">
              <MoveLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Reboot System
            </Button>
          </Link>
        </motion.div>
      </div>

      {/* Decorative Terminal Line */}
      <div className="fixed bottom-6 left-6 text-[10px] text-neutral-700 font-mono flex items-center gap-2">
        <Terminal className="w-3 h-3" />
        <span>root@offgrid:~/errors# _</span>
      </div>
    </main>
  );
}
