import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  duration?: number | null;
  showDownload?: boolean;
  enhanced?: boolean;
}

const AudioPlayer = ({ 
  audioUrl, 
  title = "Recording",
  duration,
  showDownload = true,
  enhanced = false
}: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    window.open(audioUrl, '_blank');
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Enhanced player with custom controls
  if (enhanced) {
    return (
      <div className="bg-white border border-border rounded-lg p-4">
        <audio ref={audioRef} src={audioUrl} preload="metadata" />

        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex-shrink-0 w-12 h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Volume2 size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{title}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">{formatTime(currentTime)}</span>

              <input
                type="range"
                min="0"
                max={totalDuration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />

              <span className="text-xs text-muted-foreground w-12 text-right">
                {formatTime(totalDuration)}
              </span>
            </div>
          </div>

          {showDownload && (
            <button
              onClick={handleDownload}
              className="flex-shrink-0 p-2 hover:bg-secondary rounded-lg transition-colors"
              aria-label="Download audio"
            >
              <Download size={20} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Simple player (original design)
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-border">
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground mb-2">🎧 {title}</p>
        <audio 
          controls 
          className="w-full"
          style={{ height: '54px' }}
        >
          <source src={audioUrl} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      </div>
      
      {showDownload && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full"
        >
          <a 
            href={audioUrl} 
            download
            className="flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Download Recording</span>
          </a>
        </Button>
      )}
    </div>
  );
};

export default AudioPlayer;
