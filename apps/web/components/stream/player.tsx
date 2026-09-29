'use client';

import { RoomAudioRenderer, useDataChannel, useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useState } from 'react';

/**
 * Viewer player: screen share as the main picture when present, camera as a bubble on top;
 * camera alone otherwise. Must be rendered inside <LiveKitRoom>.
 */
export function StreamVideo({ blurred: initialBlur }: { blurred: boolean }) {
  const [blurred, setBlurred] = useState(initialBlur);
  useDataChannel('system', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { type: string; on?: boolean };
      if (data.type === 'blur') setBlurred(!!data.on);
    } catch {
      // ignore malformed system messages
    }
  });

  const tracks = useTracks([Track.Source.ScreenShare, Track.Source.Camera], { onlySubscribed: true });
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const camera = tracks.find((t) => t.source === Track.Source.Camera);
  const main = screen ?? camera;

  return (
    <div className="relative aspect-video overflow-hidden rounded-card bg-black">
      {main ? (
        <VideoTrack
          trackRef={main}
          className={`h-full w-full object-contain ${blurred ? 'scale-110 blur-2xl' : ''}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted">Waiting for video…</div>
      )}
      {screen && camera && !blurred && (
        <VideoTrack
          trackRef={camera}
          className="absolute bottom-3 right-3 h-24 w-24 rounded-full border-2 border-white/40 object-cover sm:h-32 sm:w-32"
        />
      )}
      {blurred && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6 text-center text-sm">
          This stream is under review after multiple reports.
        </div>
      )}
      <RoomAudioRenderer />
    </div>
  );
}
