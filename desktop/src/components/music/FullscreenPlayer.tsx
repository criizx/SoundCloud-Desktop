import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { getCurrentTime, getDuration, handlePrev, seek, subscribe } from '../../lib/audio';
import { art, formatTime } from '../../lib/formatters';
import { invalidateAllLikesCache } from '../../lib/hooks';
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from '../../lib/icons';
import { optimisticToggleLike } from '../../lib/likes';
import { usePlayerStore, type Track } from '../../stores/player';

const SIZE = 420;

/* ── Progress slider ─────────────────────────────────────────── */

const FSProgressSlider = React.memo(() => {
  const duration = useSyncExternalStore(subscribe, getDuration);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [syncedValue, setSyncedValue] = useState(0);
  const draggingRef = useRef(false);
  const rangeRef = useRef<HTMLSpanElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);

  useEffect(() => subscribe(() => {
    if (draggingRef.current) return;
    const pct = getDuration() > 0 ? (getCurrentTime() / getDuration()) * 100 : 0;
    if (rangeRef.current) rangeRef.current.style.right = `${100 - pct}%`;
    const tw = thumbRef.current?.parentElement;
    if (tw) tw.style.left = `${pct}%`;
  }), []);

  const onValueChange = useCallback(([v]: number[]) => {
    setDragValue(v);
    if (!draggingRef.current) { draggingRef.current = true; setDragging(true); }
  }, []);

  const onValueCommit = useCallback(([v]: number[]) => {
    seek(v);
    draggingRef.current = false;
    setDragging(false);
    setSyncedValue(v);
  }, []);

  return (
    <div className="flex flex-col gap-0.5">
      <Slider.Root
        className="relative flex items-center w-full h-4 cursor-pointer group select-none touch-none"
        value={[dragging ? dragValue : syncedValue]}
        max={duration || 1}
        step={0.1}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      >
        <Slider.Track className="relative h-[2px] grow rounded-full bg-white/20 group-hover:h-[3px] transition-all duration-150">
          <Slider.Range ref={rangeRef} className="absolute h-full rounded-full bg-white/80" />
        </Slider.Track>
        <Slider.Thumb
          ref={thumbRef}
          className="block w-3 h-3 rounded-full bg-white shadow scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-150 outline-none"
        />
      </Slider.Root>
      <div className="flex justify-between px-0.5">
        <FSTime fn={getCurrentTime} />
        <FSTime fn={getDuration} />
      </div>
    </div>
  );
});

const FSTime = React.memo(({ fn }: { fn: () => number }) => {
  const val = useSyncExternalStore(subscribe, () => Math.floor(fn()));
  return <span className="text-[10px] text-white/35 tabular-nums">{formatTime(val)}</span>;
});

/* ── Like button ─────────────────────────────────────────────── */

const FSLikeButton = React.memo(({ trackUrn }: { trackUrn: string }) => {
  const qc = useQueryClient();
  const { data: trackData } = useQuery({
    queryKey: ['track', trackUrn],
    queryFn: () => api<Track>(`/tracks/${encodeURIComponent(trackUrn)}`),
    enabled: !!trackUrn,
    staleTime: 30_000,
  });
  const [liked, setLiked] = useState<boolean | null>(null);
  const prevUrn = useRef(trackUrn);
  if (prevUrn.current !== trackUrn) { prevUrn.current = trackUrn; setLiked(null); }
  const isLiked = liked ?? trackData?.user_favorite ?? false;

  const toggle = async () => {
    const next = !isLiked;
    setLiked(next);
    if (trackData) optimisticToggleLike(qc, trackData, next);
    invalidateAllLikesCache();
    try {
      await api(`/likes/tracks/${encodeURIComponent(trackUrn)}`, { method: next ? 'POST' : 'DELETE' });
      qc.invalidateQueries({ queryKey: ['track', trackUrn, 'favoriters'] });
    } catch {
      setLiked(!next);
      if (trackData) optimisticToggleLike(qc, trackData, !next);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center justify-center transition-colors duration-200 cursor-pointer ${isLiked ? 'text-white' : 'text-white/30 hover:text-white/60'}`}
    >
      <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
    </button>
  );
});

/* ── Transport controls ──────────────────────────────────────── */

const FSControls = React.memo(() => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);

  const secondary = (active: boolean) =>
    `flex items-center justify-center transition-colors duration-150 cursor-pointer ${active ? 'text-white' : 'text-white/35 hover:text-white/70'}`;

  return (
    <div className="flex items-center justify-between w-full">
      <button type="button" onClick={toggleShuffle} className={secondary(shuffle)}>
        <Shuffle size={16} />
      </button>
      <button type="button" onClick={handlePrev} className={secondary(false)}>
        <SkipBack size={26} fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform duration-150 cursor-pointer"
      >
        {isPlaying
          ? <Pause size={36} fill="currentColor" strokeWidth={0} />
          : <Play size={36} fill="currentColor" strokeWidth={0} className="ml-1" />
        }
      </button>
      <button type="button" onClick={next} className={secondary(false)}>
        <SkipForward size={26} fill="currentColor" />
      </button>
      <button type="button" onClick={toggleRepeat} className={secondary(repeat !== 'off')}>
        {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
      </button>
    </div>
  );
});

/* ── Background ─────────────────────────────────────────────── */

const FSBackground = React.memo(({ artwork, isPlaying }: { artwork: string | null; isPlaying: boolean }) => {
  const [current, setCurrent] = useState(artwork);
  const [prev, setPrev] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (artwork === current) return;
    setPrev(current);
    setCurrent(artwork);
    setLoaded(false);
  }, [artwork]);

  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '-20%',
    width: '140%',
    height: '140%',
    objectFit: 'cover',
    filter: 'blur(70px) saturate(3.5) brightness(0.35)',
    willChange: 'transform',
    transition: 'opacity 0.8s ease',
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {prev && (
        <img
          key={prev}
          src={prev}
          alt=""
          className={isPlaying ? 'fs-bg-playing' : 'fs-bg-paused'}
          style={{ ...bgStyle, opacity: loaded ? 0 : 1 }}
        />
      )}
      {current && (
        <img
          key={current}
          src={current}
          alt=""
          className={isPlaying ? 'fs-bg-playing' : 'fs-bg-paused'}
          style={{ ...bgStyle, opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
        />
      )}
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.6) 100%)' }}
      />
    </div>
  );
});

/* ── FullscreenPlayer ────────────────────────────────────────── */

export const FullscreenPlayer = React.memo(
  ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const navigate = useNavigate();
    const currentTrack = usePlayerStore((s) => s.currentTrack);
    const isPlaying = usePlayerStore((s) => s.isPlaying);
    const artworkBg = art(currentTrack?.artwork_url, 't200x200');
    const artworkFull = art(currentTrack?.artwork_url, 't500x500');

    if (!currentTrack) return null;

    return (
      <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center outline-none overflow-hidden"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <FSBackground artwork={artworkBg} isPlaying={isPlaying} />

            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center text-white/50 hover:text-white transition-all duration-200 cursor-pointer z-10 backdrop-blur-sm"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center" style={{ width: SIZE }}>
              <div
                className="rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/10 mb-3"
                style={{ width: SIZE, height: SIZE }}
              >
                {artworkFull
                  ? <img src={artworkFull} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-white/[0.06]" />
                }
              </div>

              <div className="flex items-center w-full mb-2">
                <div className="flex-1 min-w-0 mr-3">
                  <p
                    className="text-[15px] font-semibold text-white truncate cursor-pointer hover:text-white/75 transition-colors leading-snug"
                    onClick={() => { navigate(`/track/${encodeURIComponent(currentTrack.urn)}`); onClose(); }}
                  >
                    {currentTrack.title}
                  </p>
                  <p
                    className="text-[11px] text-white/40 truncate mt-0.5 cursor-pointer hover:text-white/60 transition-colors"
                    onClick={() => { navigate(`/user/${encodeURIComponent(currentTrack.user.urn)}`); onClose(); }}
                  >
                    {currentTrack.user.username}
                  </p>
                </div>
                <FSLikeButton trackUrn={currentTrack.urn} />
              </div>

              <div className="w-full mb-3">
                <FSProgressSlider />
              </div>

              <FSControls />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);
