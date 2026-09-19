import React, { useState } from 'react';
import { usePWAInstall } from '../usePWAInstall';
import { Download, Sparkles, X, Share, Smartphone, Check } from 'lucide-react';

interface PWAInstallBannerProps {
  isDarkMode?: boolean;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ isDarkMode = true }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('pwa_banner_dismissed') === 'true';
  });

  // If already installed or dismissed this session, hide
  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  return (
    <>
      {/* Floating Bottom / Header Install Invitation */}
      {(isInstallable || isIOS) && (
        <div 
          id="pwa-install-banner"
          className={`relative overflow-hidden rounded-2xl border p-4 shadow-2xl transition-all duration-300 ${
            isDarkMode 
              ? 'bg-gradient-to-r from-slate-900/95 via-indigo-950/80 to-slate-900/95 border-indigo-500/30 text-white' 
              : 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-indigo-200 text-slate-900'
          }`}
        >
          {/* Subtle Accent Glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <img 
                src="/icon.svg" 
                alt="Panel Nimo Logo" 
                className="w-12 h-12 rounded-xl shadow-md border border-white/10 shrink-0 bg-slate-900 p-1"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-display font-bold text-sm sm:text-base leading-tight">
                    Pasang Aplikasi Panel Nimo
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    PWA
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Akses instan dari layar utama HP / Desktop tanpa buka browser, lebih cepat & fullscreen!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {isInstallable && (
                <button
                  id="btn-pwa-install"
                  onClick={install}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/25 transition-all active:scale-95 cursor-pointer flex-1 sm:flex-initial"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Install Sekarang</span>
                </button>
              )}

              {isIOS && !isInstallable && (
                <button
                  id="btn-pwa-ios-guide"
                  onClick={() => setShowIOSGuide(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-wider shadow-lg hover:bg-indigo-500 transition-all active:scale-95 cursor-pointer flex-1 sm:flex-initial"
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Pasang di iPhone/iPad</span>
                </button>
              )}

              <button
                id="btn-pwa-dismiss"
                onClick={handleDismiss}
                title="Tutup Notifikasi"
                className={`p-2 rounded-xl border transition-colors ${
                  isDarkMode 
                    ? 'border-white/10 hover:bg-white/10 text-slate-400 hover:text-white' 
                    : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div 
          id="pwa-ios-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border ${
            isDarkMode ? 'bg-slate-900 border-indigo-500/30 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <img src="/icon.svg" alt="App Icon" className="w-8 h-8 rounded-lg bg-slate-950 p-1" />
                <h3 className="font-bold text-sm">Pasang di iPhone / iPad</h3>
              </div>
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 my-5 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
                  1
                </div>
                <div>
                  Buka website ini menggunakan browser <strong>Safari</strong> di perangkat iOS Anda.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  Ketuk tombol <strong>Bagikan / Share</strong> 
                  <span className="inline-flex items-center p-1 rounded bg-slate-800 border border-slate-700 text-indigo-400">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                  di bar menu bawah Safari.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
                  3
                </div>
                <div>
                  Gulir ke bawah dan pilih opsi <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
                  4
                </div>
                <div>
                  Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas. Ikon <strong>Panel Nimo</strong> akan langsung muncul di layar utama HP Anda!
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
