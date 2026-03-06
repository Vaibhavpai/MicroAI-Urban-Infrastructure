import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Info, BellRing, XOctagon } from 'lucide-react';

export const ReplayEventLog = ({ events }) => {
    const listRef = useRef(null);

    // Auto scroll down when new events added
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [events]);

    const getIcon = (type) => {
        switch (type) {
            case 'info': return <Info className="w-4 h-4 text-emerald-400" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-orange-400" />;
            case 'alert': return <BellRing className="w-4 h-4 text-red-500" />;
            case 'failure': return <XOctagon className="w-4 h-4 text-red-600" />;
            default: return <Info className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div className="h-full overflow-y-auto flex flex-col gap-3 custom-scrollbar" ref={listRef} style={{ maxHeight: '220px' }}>
            {events.length === 0 && (
                <div className="text-slate-500 font-mono text-xs flex justify-center items-center h-full">
                    Awaiting systems initialization...
                </div>
            )}

            {events.map((evt, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border backdrop-blur-sm animate-fade-in-up shadow-md transition-all hover:shadow-lg
                    ${evt.type === 'info' ? 'bg-slate-800/80 border-slate-700/50' :
                        evt.type === 'warning' ? 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/15' :
                            evt.type === 'alert' ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15' :
                                'bg-red-900/30 border-red-500 text-red-100 shadow-red-500/20'}
                `}>
                    <div className="mt-0.5 opacity-90">{getIcon(evt.type)}</div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1.5 gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">
                                Hour {evt.hour} • Risk {evt.score.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <p className={`text-xs font-semibold leading-relaxed ${evt.type === 'failure' ? 'text-red-300 font-bold' :
                                evt.type === 'alert' ? 'text-red-400' :
                                    evt.type === 'warning' ? 'text-orange-300' :
                                        'text-slate-300'
                            }`}>
                            {evt.message}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};
