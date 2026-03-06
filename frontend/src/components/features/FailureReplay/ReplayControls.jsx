import React from 'react';
import { Play, Pause, Square, FastForward, RotateCcw } from 'lucide-react';

export const ReplayControls = ({ isPlaying, onPlayPause, onReset, speed, onSpeedChange }) => {
    const formatSpeed = (s) => `${s}x`;

    return (
        <div className="flex items-center gap-4 bg-slate-800/90 p-3.5 shadow-xl rounded-xl border border-slate-700/50 backdrop-blur-sm">
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 shadow-inner">
                <button
                    onClick={onPlayPause}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-md transition-all font-bold text-sm ${isPlaying ? 'bg-indigo-600/30 text-indigo-300 shadow-lg' : 'hover:bg-slate-800 text-slate-300 hover:text-white'}`}
                >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    <span className="tracking-widest uppercase">{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                    onClick={onReset}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-md transition-all hover:bg-slate-800 text-slate-400 hover:text-white"
                    title="Reset to Beginning"
                >
                    <RotateCcw className="w-5 h-5" />
                </button>
            </div>

            <div className="flex items-center gap-3 bg-slate-900 rounded-lg p-1.5 border border-slate-700 shadow-inner">
                <span className="px-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FastForward className="w-3.5 h-3.5" /> Speed
                </span>
                <div className="flex gap-1.5">
                    {[0.5, 1, 2, 5].map(s => (
                        <button
                            key={s}
                            onClick={() => onSpeedChange(s)}
                            className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded transition-all ${speed === s ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                        >
                            {formatSpeed(s)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
