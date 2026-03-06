import React from 'react';
import { ArrowRight } from 'lucide-react';

const FeatureBar = ({ factor, maxImpact }) => {
    const isIncreasing = factor.direction === 'increasing';
    const color = isIncreasing ? 'bg-red-500' : 'bg-emerald-500';
    const align = isIncreasing ? 'right' : 'left';

    // Normalize width for visual display (impact is usually between 0.01 and 0.5)
    // maxImpact shouldn't be 0
    let width = factor.impact / (maxImpact || 0.5) * 100;
    if (width > 100) width = 100;

    return (
        <div className="flex flex-col mb-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                <span>{factor.feature}</span>
                <span className={isIncreasing ? 'text-red-400' : 'text-emerald-400'}>
                    {(factor.impact * 100).toFixed(1)}% limit
                </span>
            </div>

            <div className="h-2 w-full bg-slate-700/50 rounded-full flex relative overflow-hidden">
                <div
                    className={`h-full ${color} rounded-full transition-all duration-500 absolute
                    ${align === 'left' ? 'left-0' : 'right-0'}`}
                    style={{ width: `${width}%` }}
                />
            </div>
        </div>
    );
};

export const SHAPComparison = ({ baselineFactors, modifiedFactors }) => {
    // Find the max absolute impact across all factors to scale bars properly
    let maxBase = Math.max(...baselineFactors.map(f => Math.abs(f.impact)), 0);
    let maxMod = Math.max(...modifiedFactors.map(f => Math.abs(f.impact)), 0);
    let maxGlobal = Math.max(maxBase, maxMod);

    return (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-6 shadow-xl">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                SHAP Feature Impact Analysis
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/50 shadow-inner">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700/50 pb-3 mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                        Baseline Factors
                    </h4>
                    {baselineFactors.map((factor, idx) => (
                        <FeatureBar key={`base-${idx}`} factor={factor} maxImpact={maxGlobal} />
                    ))}
                </div>

                <div className="bg-slate-900/50 rounded-lg p-5 border border-slate-700/50 shadow-inner relative">
                    <div className="absolute top-1/2 -left-4 -translate-y-1/2 bg-slate-800 p-1.5 rounded-full border border-slate-600 shadow-xl z-20 hidden lg:block">
                        <ArrowRight className="w-5 h-5 text-indigo-400" />
                    </div>

                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700/50 pb-3 mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
                        Modified Factors
                    </h4>
                    {modifiedFactors.map((factor, idx) => (
                        <FeatureBar key={`mod-${idx}`} factor={factor} maxImpact={maxGlobal} />
                    ))}
                </div>
            </div>
        </div>
    );
};
