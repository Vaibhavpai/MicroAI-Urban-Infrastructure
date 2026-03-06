import React from 'react';

export const ReplayScrubber = ({ currentFrameIndex, totalFrames, onChange, frames }) => {
    // Generate linear gradient string to visually represent risk
    const getGradientStop = (frame, index) => {
        const percent = (index / (totalFrames - 1)) * 100;
        let color = '#334155'; // default slate tracking
        if (frame) {
            if (frame.risk_score >= 80) color = '#ef4444';
            else if (frame.risk_score >= 60) color = '#fb923c';
            else if (frame.risk_score >= 40) color = '#facc15';
            else color = '#22c55e';
        }
        return `${color} ${percent}%`;
    };

    // Fallback if data isn't loaded yet
    const gradient = frames.length > 0
        ? `linear-gradient(to right, ${frames.map((f, i) => getGradientStop(f, i)).join(', ')})`
        : '#475569';

    const progressPercent = ((currentFrameIndex + 1) / totalFrames) * 100;

    return (
        <div className="w-full relative px-6">
            <div className="absolute top-1/2 left-6 right-6 -translate-y-1/2 h-1 bg-slate-700/50 rounded-full z-0 shadow-inner">
                <div className="w-full h-full rounded-full" style={{ background: gradient, opacity: 0.85 }} />
            </div>

            {/* Slider thumb override using styled input */}
            <input
                type="range"
                min="0"
                max={totalFrames - 1}
                value={currentFrameIndex}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full appearance-none relative z-10 h-8 bg-transparent cursor-pointer scrubber-slider outline-none"
            />

            <div className="flex justify-between mt-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                    T-Minus {totalFrames}h
                </span>
                <span className="text-slate-400 font-mono">
                    Frame: {currentFrameIndex + 1} / {totalFrames}
                </span>
                <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div>
                    T-Zero (Event)
                </span>
            </div>
        </div>
    );
};
