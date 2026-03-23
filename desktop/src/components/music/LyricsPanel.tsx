import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { api } from '../../lib/api';
import { handlePrev, seek } from '../../lib/audio';
import { art } from '../../lib/formatters';
import { invalidateAllLikesCache } from '../../lib/hooks';
import {
  Heart,
  ListPlus,
  Loader2,
  MicVocal,
  Pause,
  Play,
  repeat1Icon16,
  repeatIcon16,
  SkipBack,
  SkipForward,
  shuffleIcon16,
  X,
} from '../../lib/icons';
import { optimisticToggleLike, useLiked } from '../../lib/likes';
import type { LyricLine } from '../../lib/lyrics';
import { searchLyrics } from '../../lib/lyrics';
import { useLyricsStore } from '../../stores/lyrics';
import { type Track, usePlayerStore } from '../../stores/player';
import { ProgressSlider, ProgressTime } from '../layout/NowPlayingBar';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { artworkPanelApi } from './artworkPanelApi';
import { FloatingComments } from './FloatingComments';

/* ── Color extraction ──────────────────────────────────────── */

function extractColor(src: string): Promise<[number, number, number]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 10;
        c.height = 10;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 10, 10);
        const d = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0,
          g = 0,
          b = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        resolve([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      } catch {
        resolve([255, 85, 0]);
      }
    };
    img.onerror = () => resolve([255, 85, 0]);
    img.src = src;
  });
}

function useArtworkColor(artworkUrl: string | null) {
  const colorRef = useRef<[number, number, number]>([255, 85, 0]);
  const prevArtRef = useRef<string | null>(null);

  useEffect(() => {
    const src = art(artworkUrl, 't200x200');
    if (!src || src === prevArtRef.current) return;
    prevArtRef.current = src;
    extractColor(src).then((c) => {
      colorRef.current = c;
    });
  }, [artworkUrl]);

  return colorRef;
}

/* ── Background ────────────────────────────────────────────── */

const FullscreenBackground = React.memo(
  ({
    artworkSrc,
    color,
    isPlaying,
  }: {
    artworkSrc: string | null;
    color: [number, number, number];
    isPlaying: boolean;
  }) => {
    const [current, setCurrent] = useState(artworkSrc);
    const [prev, setPrev] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [r, g, b] = color;

    useEffect(() => {
      if (artworkSrc === current) return;
      setPrev(current);
      setCurrent(artworkSrc);
      setLoaded(false);
    }, [artworkSrc, current]);

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

    const cls = isPlaying ? 'fs-bg-playing' : 'fs-bg-paused';

    return (
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ contain: 'strict', transform: 'translateZ(0)' }}
      >
        {prev && (
          <img
            key={prev}
            src={prev}
            alt=""
            className={cls}
            style={{ ...bgStyle, opacity: loaded ? 0 : 1 }}
          />
        )}
        {current && (
          <img
            key={current}
            src={current}
            alt=""
            className={cls}
            style={{ ...bgStyle, opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
          />
        )}
        <div className="absolute inset-0 bg-black/30" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 25% 50%, rgba(${r},${g},${b},0.18) 0%, transparent 60%),
              radial-gradient(ellipse at 75% 70%, rgba(${r},${g},${b},0.10) 0%, transparent 50%),
              radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.55) 100%)
            `,
          }}
        />
      </div>
    );
  },
);

/* ── Like button ───────────────────────────────────────────── */

const FullscreenLikeButton = React.memo(({ track }: { track: Track }) => {
  const liked = useLiked(track.urn);
  const qc = useQueryClient();

  const toggle = async () => {
    const next = !liked;
    optimisticToggleLike(qc, track, next);
    invalidateAllLikesCache();
    try {
      await api(`/likes/tracks/${encodeURIComponent(track.urn)}`, {
        method: next ? 'POST' : 'DELETE',
      });
    } catch {
      optimisticToggleLike(qc, track, !next);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center justify-center transition-colors duration-200 cursor-pointer ${
        liked ? 'text-white' : 'text-white/30 hover:text-white/60'
      }`}
    >
      <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
    </button>
  );
});

/* ── Controls ──────────────────────────────────────────────── */

const Controls = React.memo(({ track }: { track: Track }) => {
  const { isPlaying, next, repeat, shuffle, togglePlay, toggleRepeat, toggleShuffle } =
    usePlayerStore(
      useShallow((s) => ({
        isPlaying: s.isPlaying,
        next: s.next,
        repeat: s.repeat,
        shuffle: s.shuffle,
        togglePlay: s.togglePlay,
        toggleRepeat: s.toggleRepeat,
        toggleShuffle: s.toggleShuffle,
      })),
    );

  const secondary = (active: boolean) =>
    `flex items-center justify-center transition-colors duration-150 cursor-pointer ${
      active ? 'text-white' : 'text-white/35 hover:text-white/70'
    }`;

  return (
    <div className="flex items-center justify-between w-full">
      <FullscreenLikeButton track={track} />
      <button type="button" onClick={toggleShuffle} className={secondary(shuffle)}>
        {shuffleIcon16}
      </button>
      <button type="button" onClick={handlePrev} className={secondary(false)}>
        <SkipBack size={26} fill="currentColor" />
      </button>
      <button type="button" onClick={togglePlay} className={secondary(false)}>
        {isPlaying ? (
          <Pause size={30} fill="currentColor" />
        ) : (
          <Play size={30} fill="currentColor" className="ml-0.5" />
        )}
      </button>
      <button type="button" onClick={next} className={secondary(false)}>
        <SkipForward size={26} fill="currentColor" />
      </button>
      <button type="button" onClick={toggleRepeat} className={secondary(repeat !== 'off')}>
        {repeat === 'one' ? repeat1Icon16 : repeatIcon16}
      </button>
      <AddToPlaylistDialog trackUrns={[track.urn]}>
        <button type="button" className={secondary(false)}>
          <ListPlus size={20} />
        </button>
      </AddToPlaylistDialog>
    </div>
  );
});

/* ── Track column ──────────────────────────────────────────── */

const TrackColumn = React.memo(({ track, size = 360 }: { track: Track; size?: number }) => {
  const { t } = useTranslation();
  const artwork500 = art(track.artwork_url, 't500x500');

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-12">
      <div
        className="rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shrink-0"
        style={{ width: size, height: size }}
      >
        {artwork500 ? (
          <img src={artwork500} alt="" className="w-full h-full object-cover" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MicVocal size={48} className="text-white/10" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2" style={{ width: size }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[15px] font-semibold text-white truncate leading-snug">
              {track.title}
            </p>
            {track.access === 'preview' && (
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-400/90 px-1.5 py-px rounded">
                {t('track.preview')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/40 truncate mt-0.5">{track.user.username}</p>
        </div>
      </div>

      <div className="flex flex-col gap-0.5" style={{ width: size }}>
        <ProgressSlider />
        <ProgressTime />
      </div>

      <div style={{ width: size }}>
        <Controls track={track} />
      </div>
    </div>
  );
});

/* ── Close button ──────────────────────────────────────────── */

const CloseBtn = React.memo(({ onClick }: { onClick: () => void }) => (
  <div className="relative z-10 flex justify-end px-6 pt-5 pb-2" data-tauri-drag-region>
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-full flex items-center justify-center text-white/25 hover:text-white/70 hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
    >
      <X size={18} />
    </button>
  </div>
));

/* ── Synced Lyrics ─────────────────────────────────────────── */

const SyncedLyrics = React.memo(({ lines }: { lines: LyricLine[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(-1);
  const linesRef = useRef(lines);
  const lineElsRef = useRef<HTMLElement[]>([]);
  linesRef.current = lines;

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      lineElsRef.current = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
    }
    activeRef.current = -1;

    void invoke('audio_set_lyrics_timeline', {
      lines: lines.map((line) => ({ timeSecs: line.time })),
    });

    const unlistenPromise = listen<number | null>('lyrics:active_line', (event) => {
      const lineEls = lineElsRef.current;
      if (!container || lineEls.length === 0) return;

      const idx = typeof event.payload === 'number' ? event.payload : -1;
      if (idx === activeRef.current) return;

      const prev = activeRef.current;
      activeRef.current = idx;

      if (prev >= 0 && prev < lineEls.length) {
        lineEls[prev].dataset.state = prev < idx ? 'past' : '';
      }
      if (idx >= 0 && idx < lineEls.length) {
        lineEls[idx].dataset.state = 'active';
        const el = lineEls[idx];
        const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
        container.scrollTo({ top, behavior: 'smooth' });
      }
      if (prev !== -1 && idx !== -1) {
        const lo = Math.min(prev, idx);
        const hi = Math.max(prev, idx);
        for (let i = lo; i <= hi; i++) {
          if (i === idx || i === prev) continue;
          const state = i < idx ? 'past' : '';
          if (lineEls[i].dataset.state !== state) lineEls[i].dataset.state = state;
        }
      }
    });

    return () => {
      void invoke('audio_clear_lyrics_timeline');
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto scrollbar-hide px-12 py-16 relative"
      style={{
        maskImage: 'linear-gradient(transparent 0%, black 10%, black 90%, transparent 100%)',
      }}
    >
      {lines.map((line, i) => (
        <div key={`${line.time}-${i}`} className="lyric-line" onClick={() => seek(line.time)}>
          {line.text}
        </div>
      ))}
      <div className="h-[40vh]" />
    </div>
  );
});

/* ── Plain Lyrics ──────────────────────────────────────────── */

const PlainLyrics = React.memo(({ text }: { text: string }) => (
  <div
    className="flex-1 overflow-y-auto scrollbar-hide px-12 py-16"
    style={{ maskImage: 'linear-gradient(transparent 0%, black 10%, black 90%, transparent 100%)' }}
  >
    <div className="text-[18px] text-white/60 font-medium whitespace-pre-wrap leading-loose">
      {text}
    </div>
  </div>
));

/* ── Shared panel wrapper ──────────────────────────────────── */

const PanelShell = React.memo(
  ({
    artworkUrl,
    isPlaying,
    onClose,
    children,
  }: {
    artworkUrl: string | null;
    isPlaying: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => {
    const colorRef = useArtworkColor(artworkUrl);
    const artworkBg = art(artworkUrl, 't200x200');

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
      <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden animate-fade-in-up bg-[#08080a]">
        <FullscreenBackground
          artworkSrc={artworkBg}
          color={colorRef.current}
          isPlaying={isPlaying}
        />
        <CloseBtn onClick={onClose} />
        <div className="relative z-10 flex-1 min-h-0" style={{ isolation: 'isolate' }}>
          {children}
        </div>
        <FloatingComments />
      </div>
    );
  },
);

/* ── Lyrics Panel ──────────────────────────────────────────── */

export const LyricsPanel = React.memo(() => {
  const open = useLyricsStore((s) => s.open);
  const close = useLyricsStore((s) => s.close);
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const { t } = useTranslation();

  const { data: lyrics, isLoading } = useQuery({
    queryKey: ['lyrics', track?.user.username, track?.title],
    queryFn: () => searchLyrics(track!.user.username, track!.title),
    enabled: open && !!track,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  if (!open || !track) return null;

  return (
    <PanelShell artworkUrl={track.artwork_url} isPlaying={isPlaying} onClose={close}>
      <div className="grid grid-cols-2 h-full">
        <TrackColumn track={track} />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.04]" />
        <div className="min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 size={24} className="animate-spin text-white/15" />
              <p className="text-[13px] text-white/25">{t('track.lyricsLoading')}</p>
            </div>
          ) : lyrics?.synced ? (
            <SyncedLyrics lines={lyrics.synced} />
          ) : lyrics?.plain ? (
            <PlainLyrics text={lyrics.plain} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 text-center">
              <MicVocal size={40} className="text-white/[0.06]" />
              <p className="text-[15px] text-white/30 font-medium">{t('track.lyricsNotFound')}</p>
              <p className="text-[12px] text-white/15 leading-relaxed max-w-[300px]">
                {t('track.lyricsNotFoundHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </PanelShell>
  );
});

/* ── Artwork Panel ─────────────────────────────────────────── */

export const ArtworkPanel = React.memo(() => {
  const [open, setOpen] = useState(false);
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    artworkPanelApi.open = () => setOpen(true);
    artworkPanelApi.close = () => setOpen(false);
  }, []);

  if (!open || !track) return null;

  return (
    <PanelShell artworkUrl={track.artwork_url} isPlaying={isPlaying} onClose={() => setOpen(false)}>
      <div className="flex items-center justify-center h-full">
        <TrackColumn track={track} size={420} />
      </div>
    </PanelShell>
  );
});
