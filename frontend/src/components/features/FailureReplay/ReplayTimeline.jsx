import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';

export const ReplayTimeline = ({ data, currentFrameIndex, totalFrames }) => {
    // Determine bounds for references
    const alertFrame = data.findIndex(d => d.alert_fired);
    const failureFrame = data.findIndex(d => d.is_failure_event);
    const anomalyStart = data.findIndex(d => d.is_anomaly);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-lg shadow-2xl text-xs z-[1000] relative backdrop-blur-md">
                    <p className="font-bold text-slate-300 mb-2 border-b border-slate-700 pb-1.5">{label.split('T')[1].substring(0, 5)}</p>
                    {payload.map((p, i) => (
                        <div key={i} className="flex gap-3 justify-between items-center mb-1">
                            <span className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></div>
                                <span className="text-slate-400">{p.name}:</span>
                            </span>
                            <span className="font-mono font-bold text-white">{Number(p.value).toFixed(1)}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="relative w-full">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-3 justify-end">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <div className="w-3 h-0.5 bg-blue-400 rounded"></div>
                    <span>Vibration</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <div className="w-3 h-0.5 bg-red-400 rounded"></div>
                    <span>Temperature</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <div className="w-3 h-0.5 bg-purple-400 rounded"></div>
                    <span>Stress Load</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <div className="w-3 h-0.5 bg-emerald-400 rounded"></div>
                    <span>Pressure</span>
                </div>
            </div>

            <div className="h-72 md:h-80 relative w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <XAxis
                            dataKey="timestamp"
                            stroke="#475569"
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                            tickFormatter={(time) => time.split('T')[1].substring(0, 5)}
                            minTickGap={30}
                        />
                        <YAxis
                            yAxisId="1"
                            stroke="#475569"
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                        />
                        <YAxis
                            yAxisId="2"
                            orientation="right"
                            domain={[0, 100]}
                            hide={true}
                        />

                        {/* Highlight Anomaly Region */}
                        {anomalyStart > -1 && anomalyStart <= currentFrameIndex && (
                            <ReferenceArea
                                x1={data[anomalyStart].timestamp}
                                x2={data[currentFrameIndex].timestamp}
                                yAxisId="1"
                                fill="#fb923c"
                                fillOpacity={0.15}
                            />
                        )}

                        <Tooltip content={<CustomTooltip />} />

                        {/* Sensor Lines */}
                        <Line yAxisId="1" type="monotone" dataKey="vibration_hz" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line yAxisId="1" type="monotone" dataKey="temperature_c" stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line yAxisId="1" type="monotone" dataKey="stress_load_kn" stroke="#a78bfa" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line yAxisId="1" type="monotone" dataKey="pressure_bar" stroke="#34d399" strokeWidth={2.5} dot={false} isAnimationActive={false} />

                        {/* Playhead Reference Line */}
                        {currentFrameIndex < data.length && (
                            <ReferenceLine
                                x={data[currentFrameIndex].timestamp}
                                yAxisId="1"
                                stroke="#c084fc"
                                strokeWidth={3}
                                strokeDasharray="4 4"
                            />
                        )}

                        {/* Alert Point */}
                        {alertFrame > -1 && alertFrame <= currentFrameIndex && (
                            <ReferenceLine
                                x={data[alertFrame].timestamp}
                                yAxisId="1"
                                stroke="#ef4444"
                                strokeWidth={2}
                                label={{ value: 'ALERT', position: 'top', fill: '#fca5a5', fontSize: 11, fontWeight: 'bold' }}
                            />
                        )}

                        {/* Failure Point */}
                        {failureFrame > -1 && failureFrame <= currentFrameIndex && (
                            <ReferenceLine
                                x={data[failureFrame].timestamp}
                                yAxisId="1"
                                stroke="#dc2626"
                                strokeWidth={3}
                                label={{ value: 'FAILURE', position: 'insideTopLeft', fill: '#f87171', fontSize: 12, fontWeight: 'bold' }}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
