import React from 'react';
import { ShieldAlert, Activity, Globe, Zap, ArrowUpRight } from 'lucide-react';

// Revert to a cleaner "glass panel" layout but keep it centered under the page title.
export const NationalOverview = ({ nationalData }) => {
    return (
        <div className="mb-8 w-full flex justify-center">
            <div className="glass-panel border-cyan/10 bg-slate-900/40 relative overflow-hidden group w-full max-w-5xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan/5 blur-3xl -mr-32 -mt-32 rounded-full transition-all duration-700 group-hover:bg-cyan/10" />

                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Globe className="w-4 h-4 text-cyan" />
                            <span className="text-gradient-cyan">National Infrastructure Federation</span>
                        </h2>
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald/10 border border-emerald/20 rounded-full">
                            <div className="status-dot-live green" />
                            <span className="text-[10px] font-bold text-emerald uppercase tracking-tighter">Network Live</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Metric 1: Assets */}
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <Activity className="w-4 h-4 text-cyan/70" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Assets</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-white tracking-tight">
                                    {nationalData?.total_assets_monitored ?? '—'}
                                </span>
                                <span className="text-xs font-bold text-emerald flex items-center gap-0.5">
                                    <ArrowUpRight size={12} /> 2.4%
                                </span>
                            </div>
                        </div>

                        {/* Metric 2: Avg Risk */}
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-4 h-4 text-amber/70" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operational Risk</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-3xl font-black tracking-tight ${nationalData?.national_average_risk > 50 ? 'text-amber' : 'text-emerald'}`}>
                                    {typeof nationalData?.national_average_risk === 'number' ? nationalData.national_average_risk.toFixed(1) : '—'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Avg Index</span>
                            </div>
                        </div>

                        {/* Metric 3: Critical */}
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldAlert className="w-4 h-4 text-rose/70" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Critical Failures</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-3xl font-black tracking-tight ${nationalData?.total_critical_nationally > 0 ? 'text-rose' : 'text-slate-300'}`}>
                                    {nationalData?.total_critical_nationally ?? 0}
                                </span>
                                <span className="text-[10px] font-bold text-rose uppercase">
                                    {nationalData?.total_critical_nationally ? 'Alerts Active' : 'All Clear'}
                                </span>
                            </div>
                        </div>

                        {/* Metric 4: Carbon */}
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <LeafIcon className="w-4 h-4 text-emerald/70" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carbon Savings</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-emerald tracking-tight">
                                    {typeof nationalData?.total_co2_saved_kg === 'number'
                                        ? `${(nationalData.total_co2_saved_kg / 1000).toFixed(1)}t`
                                        : '—'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">CO₂ avoided / yr</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LeafIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C10.5 14 11 11.5 13 11a7 7 0 0 0-4-3c-4.5 0-7 2.5-7 13Z" />
    </svg>
);
