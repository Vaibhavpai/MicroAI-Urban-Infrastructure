import React from 'react';
import { Leaf, IndianRupee, Cpu, AlertTriangle } from 'lucide-react';
import { CityRiskDonut } from './CityRiskDonut';

export const CityCard = ({ city, onClickAssets }) => {
    const getRiskColor = (score) => {
        if (score >= 80) return "text-red-500";
        if (score >= 60) return "text-orange-400";
        if (score >= 40) return "text-yellow-400";
        return "text-green-500";
    };

    const getRiskBg = (score) => {
        if (score >= 80) return "bg-red-500/10 border-red-500/20";
        if (score >= 60) return "bg-orange-400/10 border-orange-400/20";
        if (score >= 40) return "bg-yellow-400/10 border-yellow-400/20";
        return "bg-green-500/10 border-green-500/20";
    };

    const scoreColor = getRiskColor(city.average_risk_score);
    const scoreBg = getRiskBg(city.average_risk_score);

    return (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-6 hover:border-indigo-500/40 transition-all duration-300 shadow-lg flex flex-col h-full bg-gradient-to-b from-slate-800/90 to-slate-900/50 hover:shadow-xl hover:shadow-indigo-500/10">
            {/* Header */}
            <div className="flex justify-between items-start mb-5">
                <div>
                    <h3 className="text-xl font-bold tracking-tight text-white mb-1.5">{city.city_name}</h3>
                    <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">Pop: {city.population_millions || '--'}M | {city.total_assets} Assets</p>
                </div>
                <div className={`flex flex-col items-center justify-center p-3 rounded-lg border ${scoreBg} shadow-md`}>
                    <span className={`text-2xl leading-none font-black ${scoreColor}`}>
                        {city.average_risk_score.toFixed(1)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 mt-1.5 font-bold">Avg Risk</span>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6 flex-grow">
                {/* Risk Donut Chart */}
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 flex flex-col items-center justify-center relative shadow-inner">
                    <span className="text-xs text-slate-400 font-semibold mb-3 block w-full text-center tracking-wide">Risk Profile</span>
                    <div className="h-32 w-full relative">
                        <CityRiskDonut
                            critical={city.critical_count}
                            high={city.high_count}
                            medium={city.medium_count}
                            low={city.low_count}
                        />
                        {city.critical_count > 0 && (
                            <div className="absolute top-0 right-0 h-7 w-7 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/40 animate-pulse shadow-lg">
                                <span className="text-red-400 text-xs font-bold">{city.critical_count}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Key Metrics */}
                <div className="flex flex-col gap-3">
                    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 shadow-inner">
                        <div className="flex items-center gap-1.5 mb-2 opacity-80">
                            <Leaf className="w-4 h-4 text-emerald-400" />
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">CO₂ Saved</span>
                        </div>
                        <span className="text-base font-bold text-slate-200">{(city.total_co2_saved_kg / 1000).toFixed(1)} tons</span>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 shadow-inner">
                        <div className="flex items-center gap-1.5 mb-2 opacity-80">
                            <IndianRupee className="w-4 h-4 text-cyan-400" />
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Savings</span>
                        </div>
                        <span className="text-base font-bold text-slate-200">
                            {city.total_savings_inr >= 10000000
                                ? `₹${(city.total_savings_inr / 10000000).toFixed(2)} Cr`
                                : `₹${(city.total_savings_inr / 100000).toFixed(1)} L`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Federated AI + Highest Risk Box */}
            <div className="bg-gradient-to-r from-indigo-900/30 to-slate-800/30 rounded-lg p-4 border border-indigo-500/20 mb-5 shadow-md">
                <div className="flex items-center justify-between mb-3 border-b border-slate-700/50 pb-2">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-indigo-200 tracking-wide">Federated Model</span>
                    </div>
                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/30 shadow-sm">
                        {(city.federated_model_accuracy * 100).toFixed(1)}% Acc
                    </span>
                </div>

                <div className="flex items-start gap-2.5">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 ${city.highest_risk_score >= 80 ? 'text-red-400' : 'text-orange-400'}`} />
                    <div className="flex-1">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-1">Highest Risk Asset</span>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-200">{city.highest_risk_asset}</span>
                            <span className={`text-sm font-bold ml-2 ${city.highest_risk_score >= 80 ? 'text-red-400' : 'text-orange-400'}`}>
                                {city.highest_risk_score.toFixed(1)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action */}
            <button
                onClick={() => onClickAssets(city.city_id)}
                className="w-full py-3 rounded-lg bg-slate-700/50 hover:bg-indigo-600 border border-slate-600 hover:border-indigo-500 text-slate-200 hover:text-white text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-indigo-500/20"
            >
                View City Assets
            </button>
        </div>
    );
};
