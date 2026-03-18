import { getCurrentWindow } from '@tauri-apps/api/window';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Disc3 } from '../../lib/icons';

const isMac = navigator.userAgent.includes('Mac');

const NavButtons = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  // track history length to enable/disable (basic heuristic)
  const canGoBack = location.key !== 'default';

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-20 disabled:cursor-default text-white/30 hover:text-white/60 hover:bg-white/[0.06] active:scale-90"
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={() => navigate(1)}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer text-white/30 hover:text-white/60 hover:bg-white/[0.06] active:scale-90"
      >
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
});

export const Titlebar = React.memo(() => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isMac) return;
    const win = getCurrentWindow();
    win.isFullscreen().then(setIsFullscreen);
    const unlisten = win.onResized(() => {
      win.isFullscreen().then(setIsFullscreen);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div
      className="h-10 flex items-center px-4 select-none shrink-0 border-b border-white/[0.04]"
      data-tauri-drag-region
    >
      {/* spacer for macOS traffic lights — hidden in fullscreen */}
      {isMac && !isFullscreen && <div className="w-[70px] shrink-0" data-tauri-drag-region />}

      <div className="flex items-center gap-1.5" data-tauri-drag-region>
        <Disc3 size={14} className="text-accent" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-tight text-white/30">SoundCloud</span>
        <div className="ml-1">
          <NavButtons />
        </div>
      </div>
    </div>
  );
});
