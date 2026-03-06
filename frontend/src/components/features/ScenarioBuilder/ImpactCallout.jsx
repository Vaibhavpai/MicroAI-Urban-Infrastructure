import React from 'react';
import { Sparkles } from 'lucide-react';

export const ImpactCallout = ({ impactfulChange }) => {
    if (!impactfulChange) return null;

    const { feature, original_value, modified_value, risk_contribution } = impactfulChange;

    // Very minimal check to make the sentence readable
    const direction = modified_value > original_value ? 'Increasing' : 'Decreasing';
    const isWorse = risk_contribution > 0;
    const color = isWorse ? 'text-red-400' : 'text-emerald-400';
    const bg = isWorse ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
    const iconBg = isWorse ? 'bg-red-500/20' : 'bg-emerald-500/20';

    return (
        <div className={`mt-6 p-5 rounded-xl border flex items-start gap-4 shadow-lg ${bg}`}>
            <div className={`p-3 rounded-lg bg-slate-900 ${color} border border-slate-700/50 shadow-md ${iconBg}`}>
                <Sparkles className="w-6 h-6" />
            </div>

            <div className="flex-1">
                <h3 className={`text-sm font-bold uppercase tracking-widest mb-2 ${color} flex items-center gap-2`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isWorse ? '#f87171' : '#34d399' }}></span>
                    Most Impactful Change
                </h3>
                <p className="text-slate-300 font-medium leading-relaxed">
                    <span className="font-bold text-white tracking-wider bg-slate-900 px-2 py-1 rounded border border-slate-700 mx-1 shadow-sm">{direction}</span>
                    the <span className="text-white font-semibold">{feature.replace(/_/g, ' ')}</span> from <span className="font-mono font-bold text-slate-100 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{Number(original_value).toFixed(1)}</span> to <span className="font-mono font-bold text-slate-100 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{Number(modified_value).toFixed(1)}</span>
                    {" "}{isWorse ? 'added' : 'subtracted'}{" "}
                    <span className={`font-bold tracking-widest bg-slate-900 px-2 py-1 rounded border border-slate-700 mx-1 shadow-sm ${color}`}>
                        {isWorse ? '+' : '-'}{Math.abs(risk_contribution).toFixed(1)} risk points
                    </span>
                    to the overall baseline.
                </p>
            </div>
        </div>
    );
};
