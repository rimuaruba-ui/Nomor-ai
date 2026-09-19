import React, { useState } from 'react';
import { Download, Smartphone, X, Sparkles, CheckCircle2, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../usePWAInstall';

interface PWAInstallBannerProps {
  isDarkMode: boolean;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ isDarkMode }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Do not show if already running inside installed standalone PWA or manually closed
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else if (isInstallable) {
      await install();
    } else {
      // Fallback modal with instruction
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {/* Interactive Install Banner in UI */}
      <div 
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 shadow-lg ${
          isDarkMode 
            ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900/90 to-emerald-950/60 border-indigo-500/30' 
            : 'bg-gradient-to-r from-indigo-50 via-white to-emerald-50 border-indigo-200 shadow-indigo-100/50'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden shadow-md shadow-indigo-500/20 border border-indigo-500/30">
              <img src="/icon.svg" alt="Panel Nimo Icon" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-indigo-500/10 mix-blend-overlay"></div>
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-display font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Install Panel Nimo App
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> PWA
                </span>
              </div>
              <span className={`text-[11px] font-medium ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Akses cepat dari Home Screen tanpa browser bar
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 active:scale-95 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-500/25 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Install App</span>
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className={`p-2 rounded-xl transition-colors ${
                isDarkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
              title="Tutup banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari / Browser Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-reveal">
          <div className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-6 ${
            isDarkMode ? 'bg-[#1f2024] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <img src="/icon.svg" alt="App Icon" className="w-12 h-12 rounded-2xl shadow-lg border border-indigo-500/30" />
                <div>
                  <h3 className="text-base font-display font-black tracking-tight">Pasang ke Layar Utama</h3>
                  <p className="text-xs text-zinc-500 font-mono">PWA Native Installation</p>
                </div>
              </div>
              <button 
                onClick={() => setShowIOSModal(false)}
                className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-white/10 text-zinc-400' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`p-4 rounded-2xl border space-y-3.5 text-xs ${
              isDarkMode ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs mt-0.5">
                  1
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold flex items-center gap-1.5">
                    Klik tombol Share <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                  </p>
                  <p className={`${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Di Safari (iPhone) atau menu titik tiga di browser Chrome.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs mt-0.5">
                  2
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold flex items-center gap-1.5">
                    Pilih "Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                  </p>
                  <p className={`${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Atau "Tambahkan ke Layar Utama" / "Install Aplikasi".
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs mt-0.5">
                  3
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold flex items-center gap-1.5">
                    Konfirmasi Pasang <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  </p>
                  <p className={`${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Icon <strong>Panel Nimo</strong> akan langsung muncul di menu aplikasi/home screen Anda!
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 active:scale-98 text-white font-display font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-indigo-500/20"
            >
              Mengerti & Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
};
