import React from 'react';
import { Watch, AlertTriangle, ShieldCheck } from 'lucide-react';

export const AdvanceWarningCard = ({ advanceWarningHours, alertTime, failureTime }) => {
    // Formatting times to be more readable
    const formatTime = (ts) => {
        if (!ts) return "--:--";
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="bg-gradient-to-br from-emerald-500/25 via-emerald-600/20 to-slate-800/80 border-2 border-emerald-500/40 rounded-xl p-6 shadow-2xl relative overflow-hidden flex flex-col justify-center h-full">
            <div className="absolute -right-12 -top-12 opacity-10">
                <ShieldCheck size={180} className="text-emerald-500" />
            </div>

            <div className="flex items-center gap-2 mb-4 z-10">
                <span className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 rounded uppercase shadow-md animate-pulse">
                    Early Warning System Active
                </span>
            </div>

            <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight mb-5 z-10 flex items-start gap-3">
                <span className="text-emerald-400 text-4xl animate-pulse">⚡</span>
                <span>
                    System detected failure{' '}
                    <span className="block text-emerald-400 text-3xl lg:text-4xl mt-1">
                        {advanceWarningHours.toFixed(1)} hours
                    </span>
                    <span className="block text-lg text-slate-300 mt-1">in advance</span>
                </span>
            </h2>

            <div className="flex flex-col gap-3 mt-auto z-10">
                <div className="flex items-center gap-3 bg-slate-900/60 p-3.5 rounded-lg border border-slate-700/50 backdrop-blur-sm shadow-lg">
                    <div className="bg-orange-500/20 p-2.5 rounded-full border border-orange-500/30 shadow-md">
                        <AlertTriangle className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold">Alert Triggered</span>
                        <span className="text-base font-bold text-slate-200">{formatTime(alertTime)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-900/60 p-3.5 rounded-lg border border-slate-700/50 backdrop-blur-sm shadow-lg">
                    <div className="bg-red-500/20 p-2.5 rounded-full border border-red-500/30 shadow-md">
                        <Watch className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold">Failure Event</span>
                        <span className="text-base font-bold text-slate-200">{formatTime(failureTime)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
