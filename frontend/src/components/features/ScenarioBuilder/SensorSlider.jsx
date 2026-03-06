import React from 'react';

export const SensorSlider = ({ label, value, min, max, unit, onChange }) => {
    // calculate percentage for gradient effect
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="mb-6 last:mb-0 group">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider group-hover:text-indigo-400 transition-colors">
                    {label.replace(/_/g, ' ')}
                </label>
                <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-700 font-mono">
                    <span className="text-sm font-bold text-white tracking-widest">{Number(value).toFixed(1)}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{unit}</span>
                </div>
            </div>
            <div className="relative pt-1 flex items-center">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={(max - min) / 100}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer outline-none slider-thumb z-10"
                    style={{
                        background: `linear-gradient(to right, #4f46e5 ${percentage}%, #334155 ${percentage}%)`
                    }}
                />
            </div>
            <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] font-semibold text-slate-500">{min} {unit}</span>
                <span className="text-[10px] font-semibold text-slate-500">{max} {unit}</span>
            </div>
        </div>
    );
};
