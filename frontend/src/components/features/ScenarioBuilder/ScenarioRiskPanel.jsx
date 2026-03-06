import React from 'react';
import { ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';

// Reusing logic from Analytics.jsx gauge where possible, or simple SVG arc
const Gauge = ({ score, isBaseline }) => {
    // 0 to 100 mapping to an SVG arc. 180 degrees.
    const radius = 60;
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    const getColor = (s) => {
        if (isBaseline) return '#94a3b8'; // slate-400
        if (s >= 80) return '#ef4444';
        if (s >= 60) return '#fb923c';
        if (s >= 40) return '#facc15';
        return '#22c55e';
    };

    const color = getColor(score);

    return (
        <div className="flex flex-col items-center relative">
            <svg className="w-40 h-24 transform -rotate-180" viewBox="0 0 140 70">
                {/* Background Arc */}
                <path
                    d="M 10,70 A 60,60 0 0,1 130,70"
                    fill="none"
                    stroke="#1e293b" // slate-800
                    strokeWidth="10"
                    strokeLinecap="round"
                />
                {/* Foreground Arc */}
                <path
                    d="M 10,70 A 60,60 0 0,1 130,70"
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute top-12 flex flex-col items-center z-10">
                <span className="text-3xl font-black tabular-nums tracking-tighter" style={{ color }}>
                    {score.toFixed(1)}
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    {isBaseline ? "Baseline" : "Scenario"}
                </span>
            </div>
        </div>
    );
};

export const ScenarioRiskPanel = ({ baselineScore, modifiedScore, levelChanged, delta }) => {
    const isIncreased = delta > 0;
    const deltaColor = isIncreased ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

    return (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-6 shadow-xl relative overflow-hidden mb-6 flex flex-col items-center">
            {levelChanged && (
                <div className="absolute top-0 left-0 w-full bg-red-500/20 border-b-2 border-red-500/40 text-center py-2 flex justify-center items-center gap-2 backdrop-blur-sm">
                    <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
                    <span className="text-sm font-bold text-red-400 uppercase tracking-widest">⚠️ Risk Level Changed</span>
                </div>
            )}

            <div className={`w-full flex justify-around items-center ${levelChanged ? 'mt-10' : ''}`}>
                <Gauge score={baselineScore} isBaseline={true} />

                <div className="flex flex-col items-center justify-center -mt-6">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-base shadow-lg ${deltaColor}`}>
                        {isIncreased ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)} pts
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 font-bold">Delta</span>
                </div>

                <Gauge score={modifiedScore} isBaseline={false} />
            </div>
        </div>
    );
};
