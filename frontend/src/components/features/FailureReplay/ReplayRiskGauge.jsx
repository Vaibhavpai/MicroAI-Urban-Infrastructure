import React from 'react';

export const ReplayRiskGauge = ({ score }) => {
    // Determine bounds and properties based on 0-100 score mapped to 180 degrees
    const r = 80; // Radius
    const circ = Math.PI * r;
    const dashoffset = circ - ((score / 100) * circ);

    // Dynamic color calculation for smooth transition
    let color = '#22c55e'; // default green
    if (score >= 40) color = '#facc15'; // yellow
    if (score >= 60) color = '#fb923c'; // orange
    if (score >= 80) color = '#ef4444'; // red

    return (
        <div className="flex flex-col items-center justify-center relative w-full h-full min-h-[160px]">
            <svg viewBox="0 0 200 110" className="w-[80%] max-w-[240px] transform -rotate-180 drop-shadow-lg">
                <path
                    d="M 20,100 A 80,80 0 0,1 180,100"
                    fill="none"
                    stroke="#1e293b" // slate-800
                    strokeWidth="16"
                    strokeLinecap="round"
                />
                <path
                    d="M 20,100 A 80,80 0 0,1 180,100"
                    fill="none"
                    stroke={color}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={dashoffset}
                    className="transition-all duration-300 ease-linear" // fast but smooth enough for 72 ticks
                />
            </svg>
            <div className="absolute top-[60%] flex flex-col items-center">
                <span className="text-4xl font-black tabular-nums transition-colors duration-300" style={{ color }}>
                    {score.toFixed(1)}
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Live Risk</span>
            </div>
        </div>
    );
};
